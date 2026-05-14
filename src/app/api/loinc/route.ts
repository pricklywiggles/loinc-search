import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupLoinc } from '@/lib/search';

const CodeSchema = z.object({
  code: z.string().regex(/^\d{1,7}-\d$/),
});

const CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = CodeSchema.safeParse({ code: searchParams.get('code') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid LOINC code' }, { status: 400 });
  }

  try {
    const hit = await lookupLoinc(parsed.data.code);
    if (!hit) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(hit, {
      headers: { 'Cache-Control': CACHE_HEADER },
    });
  } catch (err) {
    console.error('loinc route error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
