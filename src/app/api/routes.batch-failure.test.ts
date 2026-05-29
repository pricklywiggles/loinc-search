import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LookupResult, SearchResult } from '@/types/loinc';

// Separate file: this mocks @/lib/search wholesale to force a per-item rejection,
// which would otherwise pollute the real-DB assertions in routes.test.ts.
vi.mock('@/lib/search', () => ({
  lookupLoinc: vi.fn(),
  searchLoinc: vi.fn(),
}));

import { lookupLoinc, searchLoinc } from '@/lib/search';
import { GET as loincGET } from './loinc/route';
import { GET as searchGET } from './search/route';

const mockLookup = vi.mocked(lookupLoinc);
const mockSearch = vi.mocked(searchLoinc);

const CODE_A = '98979-8';
const CODE_B = '1009-0';

function req(path: string): Request {
  return new Request(`http://test.local${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('batch endpoints survive a per-item backend failure', () => {
  it('/api/loinc: a rejected lookup collapses to null while sibling slots resolve', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLookup.mockImplementation(async (code: string) => {
      if (code === CODE_B) throw new Error('neon connection reset');
      return { loinc_num: code } as unknown as LookupResult;
    });

    const res = await loincGET(req(`/api/loinc?code=${CODE_A}&code=${CODE_B}`));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ loinc_num: string } | null>;
    expect(body).toHaveLength(2);
    expect(body[0]?.loinc_num).toBe(CODE_A);
    expect(body[1]).toBeNull();
    expect(errSpy).toHaveBeenCalledWith(
      'loinc batch item failed',
      expect.objectContaining({ code: CODE_B })
    );
    errSpy.mockRestore();
  });

  it('/api/search: a rejected search collapses to [] while sibling slots resolve', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSearch.mockImplementation(async (q: string) => {
      if (q === 'bar') throw new Error('neon statement timeout');
      return [{ loinc_num: 'X' }] as unknown as SearchResult[];
    });

    const res = await searchGET(req('/api/search?q=foo&q=bar'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Array<{ loinc_num: string }>>;
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveLength(1);
    expect(body[1]).toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      'search batch item failed',
      expect.objectContaining({ q: 'bar' })
    );
    errSpy.mockRestore();
  });
});
