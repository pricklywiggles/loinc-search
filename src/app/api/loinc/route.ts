import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupLoinc } from '@/lib/search';
import type { LookupResult } from '@/types/loinc';

const CodeSchema = z.string().regex(/^\d{1,7}-\d$/);
const MAX_BATCH = 50;

const CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

function parseList(searchParams: URLSearchParams, key: string): string[] {
  return searchParams
    .getAll(key)
    .flatMap((v) => v.split(',').map((s) => s.trim()).filter(Boolean));
}

async function lookupOrNull(code: string): Promise<LookupResult | null> {
  if (!CodeSchema.safeParse(code).success) return null;
  return lookupLoinc(code);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const items = parseList(searchParams, 'code');

  if (items.length === 0) {
    return NextResponse.json({ error: 'Invalid LOINC code' }, { status: 400 });
  }
  if (items.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many codes (max ${MAX_BATCH})` },
      { status: 400 }
    );
  }

  try {
    if (items.length === 1) {
      const code = items[0];
      if (!CodeSchema.safeParse(code).success) {
        return NextResponse.json({ error: 'Invalid LOINC code' }, { status: 400 });
      }
      const hit = await lookupLoinc(code);
      if (!hit) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json(hit, {
        headers: { 'Cache-Control': CACHE_HEADER },
      });
    }

    const settled = await Promise.allSettled(items.map(lookupOrNull));
    const hits = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      console.error('loinc batch item failed', { code: items[i], err: s.reason });
      return null;
    });
    return NextResponse.json(hits, {
      headers: { 'Cache-Control': CACHE_HEADER },
    });
  } catch (err) {
    console.error('loinc route error', { batchSize: items.length, err });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
