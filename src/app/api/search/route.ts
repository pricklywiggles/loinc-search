import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupLoinc, searchLoinc } from '@/lib/search';

const LOINC_CODE_RE = /^\d{1,7}-\d$/;

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
});

const CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({ q: searchParams.get('q') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }
  const { q } = parsed.data;

  try {
    if (LOINC_CODE_RE.test(q)) {
      const hit = await lookupLoinc(q);
      return NextResponse.json(hit ? [hit] : [], {
        headers: { 'Cache-Control': CACHE_HEADER },
      });
    }
    const rows = await searchLoinc(q);
    return NextResponse.json(rows, {
      headers: { 'Cache-Control': CACHE_HEADER },
    });
  } catch (err) {
    console.error('search route error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
