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
    expect(body.loinc_num).toBe(KNOWN_ACTIVE);
    expect(body.status).toBe('ACTIVE');
    expect(body.consumer_names.length).toBeGreaterThan(0);
    expect(body.deprecated_alias).toBeUndefined();
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
});
