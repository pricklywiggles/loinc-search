CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Mirrors src/lib/normalize-unit.ts. Single source of truth for the search
-- unit-hint filter: both the TS side (client input) and the DB side
-- (ucum_units / example_units) call this so the comparison can't drift.
-- IMMUTABLE STRICT lets the planner cache and inline it.
CREATE OR REPLACE FUNCTION loinc_normalize_unit(s text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT replace(replace(replace(replace(replace(
    lower(btrim(s)), 'μ', 'u'), 'µ', 'u'), 'mcg', 'ug'), '^', '*'), 'meq', 'mmol')
$$;

-- Bounded multiplicative ranking boost from LOINC's common-test rank (lower =
-- more commonly reported; 0/NULL → neutral 1.0). 20000 ≈ the corpus max
-- common_test_rank, i.e. the clamp boundary; 0.6 is a provisional weight, to be
-- tuned against a curated set rather than the acceptance fixture. NOT STRICT so
-- a NULL rank yields 1.0, not NULL (which would null out the whole score).
CREATE OR REPLACE FUNCTION loinc_common_test_boost(rank integer) RETURNS double precision
LANGUAGE sql IMMUTABLE AS $$
  SELECT 1.0 + 0.6 * CASE
    WHEN rank > 0 THEN greatest(0.0, 1.0 - ln(rank) / ln(20000.0))
    ELSE 0.0 END
$$;

-- Coarse dimension class for a LOINC property. Paired with loinc_unit_class()
-- so the unit-hint filter can keep dimension-equivalent codes (e.g. a "/100 WBC"
-- ratio stored as "%") and skip wrong-dimension ones. Returns NULL for anything
-- we don't confidently classify; the filter treats NULL as "unknown" and never
-- drops on it.
CREATE OR REPLACE FUNCTION loinc_property_class(property text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE property
    WHEN 'NCnc' THEN 'count_conc'
    WHEN 'MCnc' THEN 'mass_conc'
    WHEN 'SCnc' THEN 'subst_conc'
    WHEN 'CCnc' THEN 'cat_conc'
    WHEN 'ACnc' THEN 'arb_conc'
    WHEN 'MFr'  THEN 'fraction'
    WHEN 'NFr'  THEN 'fraction'
    WHEN 'SFr'  THEN 'fraction'
    WHEN 'VFr'  THEN 'fraction'
    WHEN 'Ratio' THEN 'fraction'
    WHEN 'SRto' THEN 'fraction'
    WHEN 'MRto' THEN 'fraction'
    WHEN 'NRto' THEN 'fraction'
    WHEN 'EntVol' THEN 'ent_vol'
    WHEN 'EntMeanVol' THEN 'ent_vol'
    WHEN 'EntMass' THEN 'ent_mass'
    WHEN 'EntMeanMass' THEN 'ent_mass'
    ELSE NULL
  END
$$;

-- Coarse dimension class for a normalized unit string (input is already through
-- loinc_normalize_unit, so lowercase with mcg→ug, ^→*, mEq→mmol). Deliberately
-- partial — only the confident cases; NULL otherwise. LIKE treats * and [ ] as
-- literals (only % and _ are wildcards), so "10*%" and "[iu]" match verbatim.
CREATE OR REPLACE FUNCTION loinc_unit_class(u text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN u IS NULL THEN NULL
    -- dimensionless fraction / ratio: %, x/100{cells}, per HPF/LPF, "ratio"
    WHEN u LIKE '%\%%' ESCAPE '\'
      OR u LIKE '/100%'
      OR u LIKE '%{wbcs}%'
      OR u LIKE '%/[hpf]%' OR u LIKE '%/[lpf]%'
      OR u = 'ratio'
      THEN 'fraction'
    -- entitic (per-cell) volume / mass — MCV (fL), MCH (pg); bare token only,
    -- "pg/mL" falls through to mass_conc.
    WHEN u = 'fl' THEN 'ent_vol'
    WHEN u IN ('pg', 'fg') THEN 'ent_mass'
    -- count concentration: powers of ten or cells per volume
    WHEN u LIKE '10*%' OR u LIKE 'cells/%' OR u IN ('/ul', '/ml', '/l', '/mm3')
      THEN 'count_conc'
    -- substance (molar) concentration
    WHEN u LIKE '%mol/%' THEN 'subst_conc'
    -- arbitrary concentration: international units, titers
    WHEN u LIKE '%[iu]%' OR u LIKE '%iu/%' OR u LIKE '%[arb%' THEN 'arb_conc'
    -- catalytic concentration: enzyme activity U/x
    WHEN u LIKE 'u/%' OR u LIKE 'ku/%' OR u LIKE 'mu/%' THEN 'cat_conc'
    -- mass concentration: mass prefix per volume
    WHEN u LIKE 'g/%' OR u LIKE 'mg/%' OR u LIKE 'ug/%'
      OR u LIKE 'ng/%' OR u LIKE 'pg/%' OR u LIKE 'fg/%' THEN 'mass_conc'
    ELSE NULL
  END
$$;

DROP TABLE IF EXISTS consumer_names;
DROP TABLE IF EXISTS map_to;
DROP TABLE IF EXISTS loinc;

CREATE TABLE loinc (
  id                     SERIAL PRIMARY KEY,
  loinc_num              VARCHAR(10) NOT NULL UNIQUE,
  component              TEXT NOT NULL,
  property               TEXT NOT NULL,
  time_aspct             TEXT NOT NULL,
  system                 TEXT NOT NULL,
  scale_typ              TEXT NOT NULL,
  method_typ             TEXT,
  class                  TEXT NOT NULL,
  status                 TEXT NOT NULL,
  shortname              VARCHAR(200),
  long_common_name       TEXT,
  related_names          TEXT,
  example_units          VARCHAR(100),
  ucum_units             VARCHAR(100),
  definition             TEXT,
  version_first_released TEXT,
  version_last_changed   TEXT,
  -- Per-record third-party attribution required by the LOINC license when surfacing
  -- those records. Populated for ~6.7% of rows.
  external_copyright_notice TEXT,
  -- Regenstrief's curated frequency ranks (lower = more commonly used; NULL/0 =
  -- unranked). common_test_rank is the closest LOINC ships to a "primary
  -- reportable code per analyte" signal, fed to loinc_common_test_boost().
  -- common_order_rank and classtype (1=Laboratory, 2=Clinical, 3=Claims,
  -- 4=Survey) are persisted for future levers; nothing in src/ reads them yet.
  common_test_rank       INTEGER,
  common_order_rank      INTEGER,
  classtype              INTEGER,
  -- Patient-facing consumer names, denormalized from consumer_names so the lay
  -- vocabulary ("Mean Corpuscular Hemoglobin", "Cobalamin (Vitamin B12)") counts
  -- toward search RECALL, not just ranking. The importer populates this after
  -- consumer_names loads; the generated columns below then pick it up.
  consumer_names_text    TEXT,
  search_text            TEXT GENERATED ALWAYS AS (
    COALESCE(component, '') || ' ' ||
    COALESCE(shortname, '') || ' ' ||
    COALESCE(long_common_name, '') || ' ' ||
    COALESCE(related_names, '') || ' ' ||
    COALESCE(consumer_names_text, '')
  ) STORED,
  search_vector          tsvector GENERATED ALWAYS AS (
    to_tsvector('english',
      COALESCE(component, '') || ' ' ||
      COALESCE(shortname, '') || ' ' ||
      COALESCE(long_common_name, '') || ' ' ||
      COALESCE(related_names, '') || ' ' ||
      COALESCE(consumer_names_text, ''))
  ) STORED
);

CREATE INDEX idx_loinc_fts    ON loinc USING GIN (search_vector);
CREATE INDEX idx_loinc_trgm   ON loinc USING GIN (search_text gin_trgm_ops);
CREATE INDEX idx_loinc_status ON loinc (status);

CREATE TABLE map_to (
  source_code VARCHAR(10) NOT NULL,
  target_code VARCHAR(10) NOT NULL,
  comment     TEXT,
  PRIMARY KEY (source_code, target_code)
);
CREATE INDEX idx_mapto_source ON map_to (source_code);

CREATE TABLE consumer_names (
  loinc_num     VARCHAR(10) NOT NULL,
  consumer_name TEXT        NOT NULL
);
CREATE INDEX idx_consumer_loinc     ON consumer_names (loinc_num);
CREATE INDEX idx_consumer_name_trgm ON consumer_names USING GIN (consumer_name gin_trgm_ops);
