import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupLoinc, searchLoinc } from '@/lib/search';
import type { LookupResult, SearchResult } from '@/types/loinc';

const LOINC_CODE_RE = /^\d{1,7}-\d$/;
const QSchema = z.string().trim().min(1).max(200);
const MAX_BATCH = 50;
// Bounded fan-out so one 50-item batch can't stampede Neon or starve concurrent requests.
const MAX_CONCURRENT = 8;

const CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

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

async function runOne(q: string): Promise<SearchResult[] | LookupResult[]> {
  if (LOINC_CODE_RE.test(q)) {
    const hit = await lookupLoinc(q);
    return hit ? [hit] : [];
  }
  return searchLoinc(q);
}

async function runOneOrEmpty(q: string): Promise<SearchResult[] | LookupResult[]> {
  const parsed = QSchema.safeParse(q);
  if (!parsed.success) return [];
  return runOne(parsed.data);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.getAll('q');

  if (raw.length === 0) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }
  if (raw.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many queries (max ${MAX_BATCH})` },
      { status: 400 }
    );
  }

  try {
    if (raw.length === 1) {
      const parsed = QSchema.safeParse(raw[0]);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
      }
      const rows = await runOne(parsed.data);
      return NextResponse.json(rows, {
        headers: { 'Cache-Control': CACHE_HEADER },
      });
    }

    const settled = await mapWithLimit(raw, MAX_CONCURRENT, runOneOrEmpty);
    const groups = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      console.error('search batch item failed', { q: raw[i], err: s.reason });
      return [];
    });
    return NextResponse.json(groups, {
      headers: { 'Cache-Control': CACHE_HEADER },
    });
  } catch (err) {
    console.error('search route error', { batchSize: raw.length, err });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
