import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LookupResult, SearchResult } from '@/types/loinc';

// Separate file: this mocks @/lib/search wholesale to force backend rejections,
// which would otherwise pollute the real-DB assertions in routes.test.ts.
vi.mock('@/lib/search', () => ({
  lookupLoinc: vi.fn(),
  lookupLoincMany: vi.fn(),
  searchLoinc: vi.fn(),
}));

import { lookupLoincMany, searchLoinc } from '@/lib/search';
import { GET as loincGET } from './loinc/route';
import { POST as searchPOST } from './search/route';

const mockLookupMany = vi.mocked(lookupLoincMany);
const mockSearch = vi.mocked(searchLoinc);

const CODE_A = '98979-8';
const CODE_B = '1009-0';

function req(path: string): Request {
  return new Request(`http://test.local${path}`);
}

function postReq(body: unknown): Request {
  return new Request('http://test.local/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type SearchEnvelope = {
  results: Array<{ loinc_num: string }>;
  unitFilterApplied?: boolean;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('batch endpoints surface backend failures', () => {
  it('/api/loinc: a failing batch query returns 500 (loud failure, not silent nulls)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLookupMany.mockRejectedValue(new Error('neon connection reset'));

    const res = await loincGET(req(`/api/loinc?code=${CODE_A}&code=${CODE_B}`));

    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalledWith(
      'loinc route error',
      expect.objectContaining({ batchSize: 2 })
    );
    errSpy.mockRestore();
  });

  it('/api/search: a rejected search collapses to { results: [] } while sibling slots resolve', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSearch.mockImplementation(async (q: string) => {
      if (q === 'bar') throw new Error('neon statement timeout');
      return [{ loinc_num: 'X' }] as unknown as SearchResult[];
    });

    const res = await searchPOST(
      postReq({ items: [{ q: 'foo' }, { q: 'bar' }] })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: SearchEnvelope[] };
    expect(body.items).toHaveLength(2);
    expect(body.items[0].results).toHaveLength(1);
    expect(body.items[1].results).toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      'search batch item failed',
      expect.objectContaining({ q: 'bar' })
    );
    errSpy.mockRestore();
  });

  it('/api/search: a fully-failed batch returns 500 instead of all-empty items', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSearch.mockRejectedValue(new Error('neon down'));

    const res = await searchPOST(
      postReq({ items: [{ q: 'foo' }, { q: 'bar' }, { q: 'baz' }] })
    );

    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalledWith(
      'search batch fully failed',
      expect.objectContaining({ batchSize: 3 })
    );
    errSpy.mockRestore();
  });

  it('/api/loinc: preserves input order when the batch query returns mixed hits and misses', async () => {
    mockLookupMany.mockResolvedValue([
      { loinc_num: CODE_A } as unknown as LookupResult,
      null,
    ]);
    const res = await loincGET(
      req(`/api/loinc?code=${CODE_A}&code=notacode&code=${CODE_B}`)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ loinc_num: string } | null>;
    expect(body).toHaveLength(3);
    expect(body[0]?.loinc_num).toBe(CODE_A);
    expect(body[1]).toBeNull();
    expect(body[2]).toBeNull();
    expect(mockLookupMany).toHaveBeenCalledWith([CODE_A, CODE_B]);
  });
});

describe('/api/search bounded concurrency', () => {
  it('preserves input order even when later items resolve before earlier ones', async () => {
    const N = 20;
    // Sleep inversely to index so completion order can't accidentally satisfy the assertion.
    mockSearch.mockImplementation(async (q: string) => {
      const idx = Number(q.slice(1));
      await new Promise((r) => setTimeout(r, (N - idx) * 2));
      return [{ loinc_num: q }] as unknown as SearchResult[];
    });

    const items = Array.from({ length: N }, (_, i) => ({ q: `i${i}` }));
    const res = await searchPOST(postReq({ items }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: SearchEnvelope[] };
    expect(body.items).toHaveLength(N);
    for (let i = 0; i < N; i++) {
      expect(body.items[i].results[0].loinc_num).toBe(`i${i}`);
    }
  });

  it('caps concurrent in-flight calls at the configured limit', async () => {
    let inFlight = 0;
    let peak = 0;
    mockSearch.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return [] as SearchResult[];
    });

    const items = Array.from({ length: 30 }, (_, i) => ({ q: `i${i}` }));
    const res = await searchPOST(postReq({ items }));
    expect(res.status).toBe(200);
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });
});
