import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupLoinc, searchLoinc } from '@/lib/search';
import type { LookupResult, SearchResult } from '@/types/loinc';

const LOINC_CODE_RE = /^\d{1,7}-\d$/;
const QSchema = z.string().trim().min(1).max(200);
const UnitSchema = z.string().trim().min(1).max(50);
const BatchBodySchema = z.object({
  items: z
    .array(
      z.object({
        q: z.string().trim().min(1).max(200),
        unit: z.string().trim().min(1).max(50).optional(),
      })
    )
    .min(1)
    .max(50),
});

const MAX_BATCH = 50;
// Bounded fan-out so one 50-item batch can't stampede Neon or starve concurrent requests.
const MAX_CONCURRENT = 8;

const CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

type SearchResponse = {
  results: SearchResult[] | LookupResult[];
  unitFilterApplied?: boolean;
};

async function mapWithLimit<T, U>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<U>
): Promise<PromiseSettledResult<U>[]> {
  const results: PromiseSettledResult<U>[] = new Array(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        try {
          results[idx] = { status: 'fulfilled', value: await fn(items[idx]) };
        } catch (reason) {
          results[idx] = { status: 'rejected', reason };
        }
      }
    }
  );
  await Promise.all(workers);
  return results;
}

// Codes resolve to a single record by exact match; the unit hint is meaningless
// here and is silently ignored.
async function runOne(q: string, unit?: string): Promise<SearchResponse> {
  if (LOINC_CODE_RE.test(q)) {
    const hit = await lookupLoinc(q);
    return { results: hit ? [hit] : [] };
  }
  if (!unit) return { results: await searchLoinc(q) };

  const filtered = await searchLoinc(q, unit);
  if (filtered.length > 0) {
    return { results: filtered, unitFilterApplied: true };
  }
  // Fallback: a hint that excludes every candidate is almost certainly an
  // over-constrained or mistyped unit; returning unfiltered results plus a
  // flag lets the caller decide whether to surface a "unit ignored" notice.
  const unfiltered = await searchLoinc(q);
  return { results: unfiltered, unitFilterApplied: false };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get('q');
  const rawUnit = searchParams.get('unit');

  if (rawQ == null) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }
  const parsedQ = QSchema.safeParse(rawQ);
  if (!parsedQ.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }
  // unit param is optional; if present it must be non-empty and length-capped.
  let unit: string | undefined;
  if (rawUnit != null) {
    const parsedUnit = UnitSchema.safeParse(rawUnit);
    if (!parsedUnit.success) {
      return NextResponse.json({ error: 'Invalid unit' }, { status: 400 });
    }
    unit = parsedUnit.data;
  }

  try {
    const body = await runOne(parsedQ.data, unit);
    return NextResponse.json(body, {
      headers: { 'Cache-Control': CACHE_HEADER },
    });
  } catch (err) {
    console.error('search route error', { err });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = BatchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid body (expected { items: [...] }, max ${MAX_BATCH})` },
      { status: 400 }
    );
  }

  const { items } = parsed.data;
  try {
    const settled = await mapWithLimit(items, MAX_CONCURRENT, (item) =>
      runOne(item.q, item.unit)
    );
    // Total-failure is almost always an outage, not a per-query problem; surface
    // it loudly so clients and dashboards can't mistake it for "no results".
    if (settled.every((s) => s.status === 'rejected')) {
      console.error('search batch fully failed', { batchSize: items.length });
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    const responses: SearchResponse[] = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      console.error('search batch item failed', {
        q: items[i].q,
        err: s.reason,
      });
      return { results: [] };
    });
    return NextResponse.json({ items: responses });
  } catch (err) {
    console.error('search route error', { batchSize: items.length, err });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
