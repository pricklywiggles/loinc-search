import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupLoinc, searchLoinc } from '@/lib/search';
import type { LookupResult, SearchResult } from '@/types/loinc';

const LOINC_CODE_RE = /^\d{1,7}-\d$/;
const QSchema = z.string().trim().min(1).max(200);
const MAX_BATCH = 50;

const CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

async function runOne(q: string): Promise<SearchResult[] | LookupResult[]> {
  if (LOINC_CODE_RE.test(q)) {
    const hit = await lookupLoinc(q);
    return hit ? [hit] : [];
  }
  return searchLoinc(q);
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

  const parsed = z.array(QSchema).safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }

  try {
    const groups = await Promise.all(parsed.data.map(runOne));
    const body = parsed.data.length === 1 ? groups[0] : groups;
    return NextResponse.json(body, {
      headers: { 'Cache-Control': CACHE_HEADER },
    });
  } catch (err) {
    console.error('search route error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
