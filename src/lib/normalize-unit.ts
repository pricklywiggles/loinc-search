// LOINC stores micro as both Greek mu (U+03BC) and the legacy micro sign
// (U+00B5); clients also send the ASCII "mcg" convention. We map all three
// to "ug" so that ng/mL, NG/ML, mcg/dL, μg/L, mg/24 H, etc. compare cleanly.
// Internal whitespace is preserved — "mm Hg" and "mg/24 H" are real units.
export function normalizeUnit(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .replace(/μ|µ/g, 'u')
    .replace(/mcg/g, 'ug');
}
