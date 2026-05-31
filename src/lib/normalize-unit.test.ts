import { describe, expect, it } from 'vitest';
import { sql } from './db';
import { normalizeUnit } from './normalize-unit';

describe('normalizeUnit', () => {
  it('returns null for null, undefined, empty, and whitespace-only input', () => {
    expect(normalizeUnit(null)).toBeNull();
    expect(normalizeUnit(undefined)).toBeNull();
    expect(normalizeUnit('')).toBeNull();
    expect(normalizeUnit('   ')).toBeNull();
  });

  it('lowercases and trims while preserving internal whitespace', () => {
    expect(normalizeUnit('ng/mL')).toBe('ng/ml');
    expect(normalizeUnit('  NG/ML  ')).toBe('ng/ml');
    expect(normalizeUnit('mm Hg')).toBe('mm hg');
    expect(normalizeUnit('mg/24 H')).toBe('mg/24 h');
    expect(normalizeUnit('arb U/mL')).toBe('arb u/ml');
  });

  it('maps Greek mu (U+03BC) and micro sign (U+00B5) to ASCII u', () => {
    expect(normalizeUnit('μg/L')).toBe('ug/l');
    expect(normalizeUnit('µg/L')).toBe('ug/l');
    expect(normalizeUnit('μmol/L')).toBe('umol/l');
  });

  it('maps mcg convention to ug after lowercasing', () => {
    expect(normalizeUnit('mcg/dL')).toBe('ug/dl');
    expect(normalizeUnit('MCG/mL')).toBe('ug/ml');
    expect(normalizeUnit('mcg/g creat')).toBe('ug/g creat');
  });

  it('leaves non-mass-prefix units untouched', () => {
    expect(normalizeUnit('%')).toBe('%');
    expect(normalizeUnit('[iU]/L')).toBe('[iu]/l');
    expect(normalizeUnit('U/L')).toBe('u/l');
  });
});

// The query side (this normalizer) and the storage side (the replace/btrim
// chain inside searchLoinc's SQL) must produce identical strings for the
// filter to match. This test pins that parity against a fixture covering the
// realistic shapes; a future rule added to one side will fail here.
describe('normalizeUnit ↔ SQL parity', () => {
  const fixtures = [
    'ng/mL',
    'NG/ML',
    '  ng/mL  ',
    'mcg/dL',
    'MCG/mL',
    'μg/L',
    'µg/L',
    'μmol/L',
    'mm Hg',
    'mg/24 H',
    'arb U/mL',
    '[iU]/L',
    '%',
    'ug/g{Hb}',
    'mcg/g creat',
  ];

  it('matches Postgres-side normalization element-wise', async () => {
    const ts = fixtures.map((f) => normalizeUnit(f));
    const rows = (await sql`
      SELECT replace(replace(replace(
               lower(btrim(u)),
             'μ', 'u'), 'µ', 'u'), 'mcg', 'ug') AS normalized
      FROM unnest(${fixtures}::text[]) WITH ORDINALITY AS t(u, pos)
      ORDER BY pos
    `) as unknown as Array<{ normalized: string }>;

    expect(rows.map((r) => r.normalized)).toEqual(ts);
  });
});
