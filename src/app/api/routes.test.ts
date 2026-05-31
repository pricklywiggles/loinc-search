import { describe, expect, it } from 'vitest';
import { GET as searchGET, POST as searchPOST } from './search/route';
import { GET as loincGET } from './loinc/route';

const KNOWN_ACTIVE = '98979-8'; // eGFRcr CKD-EPI 2021
const KNOWN_DEPRECATED = '1009-0'; // → 1007-4
const UNKNOWN = '00000-0';
const TOTAL_PSA = '2857-1';

const CACHE_RE = /s-maxage=60/;

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
  results: Array<{ loinc_num: string; status?: string }>;
  unitFilterApplied?: boolean;
};

describe('GET /api/search', () => {
  it('rejects empty q with 400', async () => {
    const res = await searchGET(req('/api/search?q='));
    expect(res.status).toBe(400);
  });

  it('rejects q over 200 chars with 400', async () => {
    const long = 'a'.repeat(201);
    const res = await searchGET(req(`/api/search?q=${long}`));
    expect(res.status).toBe(400);
  });

  it('returns a wrapped non-empty ranked array with cache header for a text query', async () => {
    const res = await searchGET(req('/api/search?q=blood+urea+nitrogen'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(CACHE_RE);
    const body = (await res.json()) as SearchEnvelope;
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.unitFilterApplied).toBeUndefined();
    for (const r of body.results) expect(['ACTIVE', 'TRIAL']).toContain(r.status);
  });

  it('auto-routes to lookup when q is a LOINC code', async () => {
    const res = await searchGET(req(`/api/search?q=${KNOWN_ACTIVE}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchEnvelope;
    expect(body.results).toHaveLength(1);
    expect(body.results[0].loinc_num).toBe(KNOWN_ACTIVE);
  });

  it('filters by unit hint and reports unitFilterApplied=true when results survive', async () => {
    const res = await searchGET(
      req(`/api/search?q=PSA&unit=${encodeURIComponent('ng/mL')}`)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchEnvelope;
    expect(body.unitFilterApplied).toBe(true);
    expect(body.results.find((r) => r.loinc_num === TOTAL_PSA)).toBeDefined();
  });

  it('falls back to unfiltered results with unitFilterApplied=false when the hint excludes everything', async () => {
    const res = await searchGET(
      req(`/api/search?q=PSA&unit=${encodeURIComponent('parsec/mol')}`)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchEnvelope;
    expect(body.unitFilterApplied).toBe(false);
    expect(body.results.length).toBeGreaterThan(0);
  });

  it('rejects an oversized unit param with 400', async () => {
    const big = 'a'.repeat(51);
    const res = await searchGET(req(`/api/search?q=PSA&unit=${big}`));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/search', () => {
  it('rejects an empty body with 400', async () => {
    const res = await searchPOST(postReq({}));
    expect(res.status).toBe(400);
  });

  it('rejects a non-JSON body with 400', async () => {
    const res = await searchPOST(
      new Request('http://test.local/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a batch exceeding the cap with 400', async () => {
    const items = Array.from({ length: 51 }, () => ({ q: 'foo' }));
    const res = await searchPOST(postReq({ items }));
    expect(res.status).toBe(400);
  });

  it('returns one wrapped response per item, in order', async () => {
    const res = await searchPOST(
      postReq({
        items: [{ q: KNOWN_ACTIVE }, { q: 'blood urea nitrogen' }],
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: SearchEnvelope[] };
    expect(body.items).toHaveLength(2);
    expect(body.items[0].results[0].loinc_num).toBe(KNOWN_ACTIVE);
    expect(body.items[1].results.length).toBeGreaterThan(0);
  });

  it('threads per-item unit hints through to the filter', async () => {
    const res = await searchPOST(
      postReq({
        items: [
          { q: 'PSA', unit: 'ng/mL' },
          { q: 'PSA' },
        ],
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: SearchEnvelope[] };
    expect(body.items[0].unitFilterApplied).toBe(true);
    expect(
      body.items[0].results.find((r) => r.loinc_num === TOTAL_PSA)
    ).toBeDefined();
    expect(body.items[1].unitFilterApplied).toBeUndefined();
  });

  it('accepts a batch of exactly 50 items (cap boundary)', async () => {
    const items = Array.from({ length: 50 }, () => ({ q: KNOWN_ACTIVE }));
    const res = await searchPOST(postReq({ items }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: SearchEnvelope[] };
    expect(body.items).toHaveLength(50);
  });
});

describe('GET /api/loinc', () => {
  it('rejects an invalid code format with 400', async () => {
    const res = await loincGET(req('/api/loinc?code=notacode'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing code with 400', async () => {
    const res = await loincGET(req('/api/loinc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown code', async () => {
    const res = await loincGET(req(`/api/loinc?code=${UNKNOWN}`));
    expect(res.status).toBe(404);
  });

  it('returns the full record with cache header for a valid active code', async () => {
    const res = await loincGET(req(`/api/loinc?code=${KNOWN_ACTIVE}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(CACHE_RE);
    const body = (await res.json()) as {
      loinc_num: string;
      status: string;
      consumer_names: string[];
      deprecated_alias?: unknown;
    };
    // Pins the single-input contract: bare object, never a 1-element array.
    expect(Array.isArray(body)).toBe(false);
    expect(body.loinc_num).toBe(KNOWN_ACTIVE);
    expect(body.status).toBe('ACTIVE');
    expect(body.consumer_names.length).toBeGreaterThan(0);
    expect(body.deprecated_alias).toBeUndefined();
  });

  it('treats a trailing comma as single-input (drops the empty fragment)', async () => {
    const res = await loincGET(req(`/api/loinc?code=${KNOWN_ACTIVE},`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      loinc_num: string;
    };
    expect(Array.isArray(body)).toBe(false);
    expect(body.loinc_num).toBe(KNOWN_ACTIVE);
  });

  it('redirects a deprecated code to its target with deprecated_alias populated', async () => {
    const res = await loincGET(req(`/api/loinc?code=${KNOWN_DEPRECATED}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      loinc_num: string;
      deprecated_alias: { source_code: string };
    };
    expect(body.deprecated_alias.source_code).toBe(KNOWN_DEPRECATED);
    expect(body.loinc_num).not.toBe(KNOWN_DEPRECATED);
  });

  it('returns an array preserving input order with null for misses when multiple codes are passed', async () => {
    const res = await loincGET(
      req(`/api/loinc?code=${KNOWN_ACTIVE}&code=${UNKNOWN}&code=${KNOWN_DEPRECATED}`)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(CACHE_RE);
    const body = (await res.json()) as Array<
      | null
      | { loinc_num: string; deprecated_alias?: { source_code: string } }
    >;
    expect(body).toHaveLength(3);
    expect(body[0]?.loinc_num).toBe(KNOWN_ACTIVE);
    expect(body[1]).toBeNull();
    expect(body[2]?.deprecated_alias?.source_code).toBe(KNOWN_DEPRECATED);
  });

  it('accepts a comma-separated list of codes', async () => {
    const res = await loincGET(
      req(`/api/loinc?code=${KNOWN_ACTIVE},${UNKNOWN}`)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<null | { loinc_num: string }>;
    expect(body).toHaveLength(2);
    expect(body[0]?.loinc_num).toBe(KNOWN_ACTIVE);
    expect(body[1]).toBeNull();
  });

  it('accepts a mix of repeated params and comma-separated values', async () => {
    const res = await loincGET(
      req(`/api/loinc?code=${KNOWN_ACTIVE},${KNOWN_DEPRECATED}&code=${UNKNOWN}`)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<null | { loinc_num: string }>;
    expect(body).toHaveLength(3);
  });

  it('returns null for invalid code entries in a multi-code batch (does not fail the batch)', async () => {
    const res = await loincGET(
      req(`/api/loinc?code=${KNOWN_ACTIVE}&code=notacode`)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<null | { loinc_num: string }>;
    expect(body).toHaveLength(2);
    expect(body[0]?.loinc_num).toBe(KNOWN_ACTIVE);
    expect(body[1]).toBeNull();
  });

  it('accepts a batch of exactly 50 codes (cap boundary)', async () => {
    const codes = Array.from({ length: 50 }, () => `code=${KNOWN_ACTIVE}`).join('&');
    const res = await loincGET(req(`/api/loinc?${codes}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(50);
  });

  it('rejects a batch exceeding the cap with 400 (repeated-param form)', async () => {
    const codes = Array.from({ length: 51 }, () => `code=${KNOWN_ACTIVE}`).join('&');
    const res = await loincGET(req(`/api/loinc?${codes}`));
    expect(res.status).toBe(400);
  });

  it('rejects a batch exceeding the cap with 400 (comma-expanded form)', async () => {
    const codes = Array.from({ length: 51 }, () => KNOWN_ACTIVE).join(',');
    const res = await loincGET(req(`/api/loinc?code=${codes}`));
    expect(res.status).toBe(400);
  });
});
