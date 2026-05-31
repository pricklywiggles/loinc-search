-- Dimension gate for the unit-hint filter. Adds two classifier functions used
-- by searchLoinc; no table changes. Idempotent — run on an existing database
-- BEFORE deploying the code that references them.
--
--   psql "$DATABASE_URL_UNPOOLED" -f migrations/0002_dimension_gate.sql

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

CREATE OR REPLACE FUNCTION loinc_unit_class(u text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN u IS NULL THEN NULL
    WHEN u LIKE '%\%%' ESCAPE '\'
      OR u LIKE '/100%'
      OR u LIKE '%{wbcs}%'
      OR u LIKE '%/[hpf]%' OR u LIKE '%/[lpf]%'
      OR u = 'ratio'
      THEN 'fraction'
    WHEN u = 'fl' THEN 'ent_vol'
    WHEN u IN ('pg', 'fg') THEN 'ent_mass'
    WHEN u LIKE '10*%' OR u LIKE 'cells/%' OR u IN ('/ul', '/ml', '/l', '/mm3')
      THEN 'count_conc'
    WHEN u LIKE '%mol/%' THEN 'subst_conc'
    WHEN u LIKE '%[iu]%' OR u LIKE '%iu/%' OR u LIKE '%[arb%' THEN 'arb_conc'
    WHEN u LIKE 'u/%' OR u LIKE 'ku/%' OR u LIKE 'mu/%' THEN 'cat_conc'
    WHEN u LIKE 'g/%' OR u LIKE 'mg/%' OR u LIKE 'ug/%'
      OR u LIKE 'ng/%' OR u LIKE 'pg/%' OR u LIKE 'fg/%' THEN 'mass_conc'
    ELSE NULL
  END
$$;
