import { describe, expect, it } from 'vitest';
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
