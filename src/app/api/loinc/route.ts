import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupLoinc } from '@/lib/search';

const CodeSchema = z.string().regex(/^\d{1,7}-\d$/);
const MAX_BATCH = 50;

const CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

function parseList(searchParams: URLSearchParams, key: string): string[] {
  return searchParams.getAll(key).flatMap((v) => v.split(',').map((s) => s.trim()));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const items = parseList(searchParams, 'code');

  if (items.length === 0 || items.some((s) => s.length === 0)) {
    return NextResponse.json({ error: 'Invalid LOINC code' }, { status: 400 });
  }
  if (items.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many codes (max ${MAX_BATCH})` },
      { status: 400 }
    );
  }

  const parsed = z.array(CodeSchema).safeParse(items);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid LOINC code' }, { status: 400 });
  }

  try {
    if (parsed.data.length === 1) {
      const hit = await lookupLoinc(parsed.data[0]);
      if (!hit) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json(hit, {
        headers: { 'Cache-Control': CACHE_HEADER },
      });
    }

    const hits = await Promise.all(parsed.data.map((c) => lookupLoinc(c)));
    return NextResponse.json(hits, {
      headers: { 'Cache-Control': CACHE_HEADER },
    });
  } catch (err) {
    console.error('loinc route error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
