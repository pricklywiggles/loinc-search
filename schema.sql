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
  -- reportable code per analyte" signal, used by ranking as a bounded tiebreak.
  -- classtype: 1=Laboratory, 2=Clinical, 3=Claims, 4=Survey.
  common_test_rank       INTEGER,
  common_order_rank      INTEGER,
  classtype              INTEGER,
  search_text            TEXT GENERATED ALWAYS AS (
    COALESCE(component, '') || ' ' ||
    COALESCE(shortname, '') || ' ' ||
    COALESCE(long_common_name, '') || ' ' ||
    COALESCE(related_names, '')
  ) STORED,
  search_vector          tsvector GENERATED ALWAYS AS (
    to_tsvector('english',
      COALESCE(component, '') || ' ' ||
      COALESCE(shortname, '') || ' ' ||
      COALESCE(long_common_name, '') || ' ' ||
      COALESCE(related_names, ''))
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
