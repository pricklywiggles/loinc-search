import { describe, expect, it } from 'vitest';
import { GET as searchGET } from './search/route';
import { GET as loincGET } from './loinc/route';

const KNOWN_ACTIVE = '98979-8'; // eGFRcr CKD-EPI 2021
const KNOWN_DEPRECATED = '1009-0'; // → 1007-4
const UNKNOWN = '00000-0';

const CACHE_RE = /s-maxage=60/;

function req(path: string): Request {
  return new Request(`http://test.local${path}`);
}

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

  it('returns a non-empty ranked array with cache header for a text query', async () => {
    const res = await searchGET(req('/api/search?q=blood+urea+nitrogen'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(CACHE_RE);
    const body = (await res.json()) as Array<{ loinc_num: string; status: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const r of body) expect(['ACTIVE', 'TRIAL']).toContain(r.status);
  });

  it('auto-routes to lookup when q is a LOINC code', async () => {
    const res = await searchGET(req(`/api/search?q=${KNOWN_ACTIVE}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ loinc_num: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].loinc_num).toBe(KNOWN_ACTIVE);
  });

  it('returns one result group per q when multiple q params are passed, with cache header', async () => {
    const res = await searchGET(
      req(`/api/search?q=${KNOWN_ACTIVE}&q=blood+urea+nitrogen`)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(CACHE_RE);
    const body = (await res.json()) as Array<Array<{ loinc_num: string }>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveLength(1);
    expect(body[0][0].loinc_num).toBe(KNOWN_ACTIVE);
    expect(body[1].length).toBeGreaterThan(0);
  });

  it('accepts a batch of exactly 50 q params (cap boundary)', async () => {
    const qs = Array.from({ length: 50 }, () => `q=${KNOWN_ACTIVE}`).join('&');
    const res = await searchGET(req(`/api/search?${qs}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(50);
  });

  it('rejects a batch exceeding the cap with 400', async () => {
    const qs = Array.from({ length: 51 }, () => 'q=foo').join('&');
    const res = await searchGET(req(`/api/search?${qs}`));
    expect(res.status).toBe(400);
  });

  it('returns an empty group for invalid q entries in a multi-q batch (does not fail the batch)', async () => {
    const res = await searchGET(req('/api/search?q=blood+urea+nitrogen&q='));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Array<{ loinc_num: string }>>;
    expect(body).toHaveLength(2);
    expect(body[0].length).toBeGreaterThan(0);
    expect(body[1]).toEqual([]);
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
