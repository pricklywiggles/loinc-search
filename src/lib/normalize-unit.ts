// LOINC stores micro as both Greek mu (U+03BC) and the legacy micro sign
// (U+00B5); clients also send the ASCII "mcg" convention. We map all three
// to "ug" so that ng/mL, NG/ML, mcg/dL, μg/L, mg/24 H, etc. compare cleanly.
// Lab reports print power-of-ten count units with a caret ("10^6/uL"); UCUM
// (and therefore LOINC's stored units) uses a star ("10*6/uL"), so fold caret
// to star or the count-code unit filter silently matches nothing.
// Labs report monovalent electrolytes (Na, K, Cl, HCO3) in mEq/L while LOINC
// stores mmol/L; for those ions the two are numerically identical, so fold
// mEq/L→mmol/L (a 2x imprecision for divalent Ca/Mg is acceptable here — the
// unit only disambiguates the analyte's dimension, not its exact magnitude).
// The same folds run on the stored side via loinc_normalize_unit() (schema.sql),
// which searchLoinc calls — so both sides compare equal. A TS↔SQL parity test
// guards the two from drifting.
// Internal whitespace is preserved — "mm Hg" and "mg/24 H" are real units.
export function normalizeUnit(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .replace(/μ|µ/g, 'u')
    .replace(/mcg/g, 'ug')
    .replace(/\^/g, '*')
    .replace(/meq/g, 'mmol');
}
