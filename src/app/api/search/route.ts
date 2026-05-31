import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupLoinc, searchLoinc } from '@/lib/search';
import type { LookupResult, SearchResult } from '@/types/loinc';

const LOINC_CODE_RE = /^\d{1,7}-\d$/;
const QSchema = z.string().trim().min(1).max(200);
const UnitSchema = z.string().trim().min(1).max(50);
const MAX_BATCH = 50;
// Envelope-only schema: shape is structural (rejected with 400), per-item q/unit
// validation happens inside runOneOrEmpty so a single malformed item degrades
// to { results: [] } instead of failing the whole batch — matching the per-item
// leniency that /api/loinc batch already provides.
const BatchBodySchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_BATCH),
});
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
  // over-constrained or mistyped unit; return unfiltered + applied:false so
  // the caller can show a "unit ignored" notice. Suppress the false flag if
  // the unfiltered query is also empty — then the unit wasn't the cause and
  // claiming a bypass would be misleading.
  const unfiltered = await searchLoinc(q);
  if (unfiltered.length === 0) {
    return { results: [], unitFilterApplied: true };
  }
  return { results: unfiltered, unitFilterApplied: false };
}

// Per-item lenient: validation failures collapse to { results: [] } rather
// than failing the whole batch, mirroring how DB rejections are handled and
// how /api/loinc batch nulls invalid slots.
async function runOneOrEmpty(item: Record<string, unknown>): Promise<SearchResponse> {
  const q = QSchema.safeParse(item.q);
  if (!q.success) return { results: [] };
  if (item.unit == null) return runOne(q.data);
  const unit = UnitSchema.safeParse(item.unit);
  if (!unit.success) return { results: [] };
  return runOne(q.data, unit.data);
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
    const settled = await mapWithLimit(items, MAX_CONCURRENT, runOneOrEmpty);
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
