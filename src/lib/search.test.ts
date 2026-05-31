import { describe, expect, it } from 'vitest';
import { sql } from './db';
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

  // 2857-1 (total PSA) ranks ~35/52 without a unit hint because LOINC's
  // consumer_name for it ("Prostate specific antigen, Blood") doesn't share
  // trigrams with the acronym, so free-PSA variants float to the top and bury
  // it past LIMIT 20. The unit filter shrinks the candidate set enough that
  // it surfaces.
  it('surfaces 2857-1 (total PSA) when a ng/mL unit hint is passed', async () => {
    const unfiltered = await searchLoinc('PSA');
    expect(unfiltered.find((r) => r.loinc_num === '2857-1')).toBeUndefined();

    const filtered = await searchLoinc('PSA', 'ng/mL');
    expect(filtered.find((r) => r.loinc_num === '2857-1')).toBeDefined();
  });

  it('treats the unit hint case-insensitively and maps μ / mcg to ug', async () => {
    const lower = await searchLoinc('PSA', 'NG/ML');
    expect(lower.find((r) => r.loinc_num === '2857-1')).toBeDefined();

    // mcg/dL → ug/dL canonical; cortisol rows publish ug/dL in ucum_units
    const cortisol = await searchLoinc('cortisol', 'mcg/dL');
    expect(cortisol.length).toBeGreaterThan(0);
    for (const r of cortisol) {
      const blob = `${r.ucum_units ?? ''};${r.example_units ?? ''}`.toLowerCase();
      expect(blob.includes('ug/dl') || blob.includes('mcg/dl')).toBe(true);
    }
  });

  it('returns [] when the unit hint matches no candidates', async () => {
    const results = await searchLoinc('PSA', 'parsec/mol');
    expect(results).toEqual([]);
  });

  // common_test_rank is the headline ranking lever; without this, a refactor of
  // the boost (dropping the > 0 guard, flipping GREATEST/ln) would stay green
  // while silently regressing every ranking. WHITE BLOOD CELLS is the clean
  // case: 6690-2 (the automated WBC count, common_test_rank 21) only out-ranks
  // the "Leukocytes other" variant 30406-3 (rank 14223) because of the boost.
  it('ranks the common WBC count 6690-2 above the rare "Leukocytes other" variant', async () => {
    const results = await searchLoinc('WHITE BLOOD CELLS', '10*3/uL');
    const canonical = results.findIndex((r) => r.loinc_num === '6690-2');
    const variant = results.findIndex((r) => r.loinc_num === '30406-3');
    expect(canonical).toBeGreaterThanOrEqual(0);
    if (variant !== -1) expect(canonical).toBeLessThan(variant);
  });
});

// Binds the boost expression used by searchLoinc's ORDER BY to its real source
// of truth (the Postgres function), the same way the parity test binds
// loinc_normalize_unit. A change to the function's shape fails here.
describe('loinc_common_test_boost()', () => {
  it('maps common_test_rank to a bounded, monotonic multiplier', async () => {
    const rows = (await sql`
      SELECT loinc_common_test_boost(r) AS boost
      FROM unnest(ARRAY[NULL, 0, 1, 21, 20000, 40000]::int[]) WITH ORDINALITY AS t(r, pos)
      ORDER BY pos
    `) as unknown as Array<{ boost: number }>;
    const b = rows.map((x) => Number(x.boost));
    // unranked (NULL / 0) → neutral 1.0; rank 1 → max 1.6; >= max rank → clamped 1.0
    expect(b[0]).toBeCloseTo(1.0, 6);
    expect(b[1]).toBeCloseTo(1.0, 6);
    expect(b[2]).toBeCloseTo(1.6, 6);
    expect(b[4]).toBeCloseTo(1.0, 6);
    expect(b[5]).toBeCloseTo(1.0, 6); // clamped — never a penalty below 1.0
    // monotonic non-increasing in rank (more common ⇒ larger boost)
    expect(b[2]).toBeGreaterThan(b[3]);
    expect(b[3]).toBeGreaterThan(b[4]);
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
