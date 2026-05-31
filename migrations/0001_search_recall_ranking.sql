-- In-place upgrade for the search recall/ranking change (PR #9).
-- Fresh databases get all of this from schema.sql; this file applies the same
-- changes to an EXISTING database without dropping data. Idempotent — safe to
-- re-run. Run this (and the re-import) BEFORE deploying the new code, which
-- references loinc.common_test_rank and loinc_common_test_boost().
--
--   psql "$DATABASE_URL_UNPOOLED" -f migrations/0001_search_recall_ranking.sql

-- 1. Unit normalizer: add caret (^→*) and mEq/L→mmol/L folds. Mirrors
--    src/lib/normalize-unit.ts; the TS↔SQL parity test guards against drift.
CREATE OR REPLACE FUNCTION loinc_normalize_unit(s text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT replace(replace(replace(replace(replace(
    lower(btrim(s)), 'μ', 'u'), 'µ', 'u'), 'mcg', 'ug'), '^', '*'), 'meq', 'mmol')
$$;

-- 2. Bounded ranking boost from common_test_rank (see schema.sql for rationale).
CREATE OR REPLACE FUNCTION loinc_common_test_boost(rank integer) RETURNS double precision
LANGUAGE sql IMMUTABLE AS $$
  SELECT 1.0 + 0.6 * CASE
    WHEN rank > 0 THEN greatest(0.0, 1.0 - ln(rank) / ln(20000.0))
    ELSE 0.0 END
$$;

-- 3. Persist LOINC's frequency ranks + class type (nullable; metadata-only).
ALTER TABLE loinc
  ADD COLUMN IF NOT EXISTS common_test_rank  INTEGER,
  ADD COLUMN IF NOT EXISTS common_order_rank INTEGER,
  ADD COLUMN IF NOT EXISTS classtype         INTEGER;

-- 4. Re-import to populate the new columns: `pnpm import-loinc --env <env> <dir>`.
--    Until then common_test_rank is NULL and the boost is a neutral 1.0.
