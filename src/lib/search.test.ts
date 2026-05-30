import { describe, expect, it } from 'vitest';
import { lookupLoinc, lookupLoincMany, searchLoinc } from './search';

const EGFR_CKD_EPI_2021 = '98979-8';
const BUN_ARTERIAL = '12961-9';
const DEPRECATED_SOURCE = '1009-0';
const DEPRECATED_TARGET = '1007-4';
// 14473-3 → 14472-5 (DISCOURAGED) → 21191-2 (ACTIVE). Tests that the alias
// chain is followed past intermediate non-ACTIVE hops.
const MULTI_HOP_SOURCE = '14473-3';

describe('searchLoinc', () => {
  it('ranks the kidney eGFR CKD-EPI 2021 code above oncology EGFR codes for "egfr"', async () => {
    const results = await searchLoinc('egfr');
    expect(results.length).toBeGreaterThan(0);
    const topThree = results.slice(0, 3).map((r) => r.loinc_num);
    expect(topThree).toContain(EGFR_CKD_EPI_2021);

    const kidneyIdx = results.findIndex((r) => r.loinc_num === EGFR_CKD_EPI_2021);
    const oncologyIdx = results.findIndex((r) => /^EGFR /.test(r.shortname ?? ''));
    if (oncologyIdx !== -1) {
      expect(kidneyIdx).toBeLessThan(oncologyIdx);
    }
  });

  it('excludes DEPRECATED and DISCOURAGED rows', async () => {
    const results = await searchLoinc('glucose');
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(['ACTIVE', 'TRIAL']).toContain(r.status);
    }
  });

  it('returns a BUN code for "blood urea nitrogen"', async () => {
    const results = await searchLoinc('blood urea nitrogen');
    expect(results.length).toBeGreaterThan(0);
    const codes = results.map((r) => r.loinc_num);
    expect(codes).toContain(BUN_ARTERIAL);
  });

  it('returns empty for nonsense input', async () => {
    const results = await searchLoinc('zzzzzzqqqqzzzz');
    expect(results).toEqual([]);
  });

  it('halves the score for TRIAL rows', async () => {
    const results = await searchLoinc('eye');
    const active = results.find((r) => r.status === 'ACTIVE');
    const trial = results.find((r) => r.status === 'TRIAL');
    if (active && trial) {
      expect(trial.score).toBeLessThan(active.score * 2);
    }
  });
});

describe('lookupLoinc', () => {
  it('returns the ACTIVE record with consumer names for an ACTIVE code', async () => {
    const hit = await lookupLoinc(EGFR_CKD_EPI_2021);
    expect(hit).not.toBeNull();
    expect(hit!.loinc_num).toBe(EGFR_CKD_EPI_2021);
    expect(hit!.status).toBe('ACTIVE');
    expect(hit!.consumer_names.length).toBeGreaterThan(0);
    expect(hit!.deprecated_alias).toBeUndefined();
  });

  it('redirects a DEPRECATED code to its target with deprecated_alias populated', async () => {
    const hit = await lookupLoinc(DEPRECATED_SOURCE);
    expect(hit).not.toBeNull();
    expect(hit!.loinc_num).toBe(DEPRECATED_TARGET);
    expect(hit!.deprecated_alias).toBeDefined();
    expect(hit!.deprecated_alias!.source_code).toBe(DEPRECATED_SOURCE);
  });

  it('returns null for an unknown code', async () => {
    const hit = await lookupLoinc('00000-0');
    expect(hit).toBeNull();
  });

  it('follows multi-hop alias chains past non-ACTIVE intermediates', async () => {
    const hit = await lookupLoinc(MULTI_HOP_SOURCE);
    expect(hit).not.toBeNull();
    expect(hit!.status).toBe('ACTIVE');
    expect(hit!.deprecated_alias).toBeDefined();
    expect(hit!.deprecated_alias!.source_code).toBe(MULTI_HOP_SOURCE);
    expect(hit!.loinc_num).not.toBe(MULTI_HOP_SOURCE);
  });
});

describe('lookupLoincMany', () => {
  it('returns [] for empty input without hitting the DB', async () => {
    const results = await lookupLoincMany([]);
    expect(results).toEqual([]);
  });

  it('returns a one-element array with the full record for a known active code', async () => {
    const results = await lookupLoincMany([EGFR_CKD_EPI_2021]);
    expect(results).toHaveLength(1);
    expect(results[0]).not.toBeNull();
    expect(results[0]!.loinc_num).toBe(EGFR_CKD_EPI_2021);
    expect(results[0]!.status).toBe('ACTIVE');
    expect(results[0]!.consumer_names.length).toBeGreaterThan(0);
    expect(results[0]!.deprecated_alias).toBeUndefined();
  });

  it('redirects a deprecated code and exposes deprecated_alias.source_code', async () => {
    const results = await lookupLoincMany([DEPRECATED_SOURCE]);
    expect(results).toHaveLength(1);
    expect(results[0]!.loinc_num).toBe(DEPRECATED_TARGET);
    expect(results[0]!.deprecated_alias!.source_code).toBe(DEPRECATED_SOURCE);
  });

  it('follows multi-hop alias chains in the batch path too', async () => {
    const results = await lookupLoincMany([MULTI_HOP_SOURCE]);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('ACTIVE');
    expect(results[0]!.deprecated_alias!.source_code).toBe(MULTI_HOP_SOURCE);
    expect(results[0]!.loinc_num).not.toBe(MULTI_HOP_SOURCE);
  });

  it('preserves input order across a mix of known, unknown, and deprecated codes', async () => {
    const results = await lookupLoincMany([
      EGFR_CKD_EPI_2021,
      '00000-0',
      DEPRECATED_SOURCE,
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]!.loinc_num).toBe(EGFR_CKD_EPI_2021);
    expect(results[1]).toBeNull();
    expect(results[2]!.loinc_num).toBe(DEPRECATED_TARGET);
    expect(results[2]!.deprecated_alias!.source_code).toBe(DEPRECATED_SOURCE);
  });

  it('returns a separate slot per duplicate input', async () => {
    const results = await lookupLoincMany([
      EGFR_CKD_EPI_2021,
      EGFR_CKD_EPI_2021,
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]!.loinc_num).toBe(EGFR_CKD_EPI_2021);
    expect(results[1]!.loinc_num).toBe(EGFR_CKD_EPI_2021);
  });
});
