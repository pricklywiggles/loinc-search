import { config as loadDotenv } from 'dotenv';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Pool, type PoolClient } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';

loadDotenv({ path: '.env.local' });
loadDotenv();

const DEFAULT_INPUT_DIR = 'docs';

const inputDir = resolve(process.argv[2] ?? DEFAULT_INPUT_DIR);

const LOINC_CSV = join(inputDir, 'LoincTable', 'Loinc.csv');
const MAPTO_CSV = join(inputDir, 'LoincTable', 'MapTo.csv');
const CONSUMER_CSV = join(inputDir, 'AccessoryFiles', 'ConsumerName', 'ConsumerName.csv');

const LOINC_RAW_COLUMNS = [
  'loinc_num', 'component', 'property', 'time_aspct', 'system', 'scale_typ',
  'method_typ', 'class', 'version_last_changed', 'chng_type', 'definition_description',
  'status', 'consumer_name', 'classtype', 'formula', 'exmpl_answers',
  'survey_quest_text', 'survey_quest_src', 'unitsrequired', 'relatednames2',
  'shortname', 'order_obs', 'hl7_field_subfield_id', 'external_copyright_notice',
  'example_units', 'long_common_name', 'example_ucum_units', 'status_reason',
  'status_text', 'change_reason_public', 'common_test_rank', 'common_order_rank',
  'hl7_attachment_structure', 'external_copyright_link', 'paneltype',
  'askatorderentry', 'associatedobservations', 'version_first_released',
  'validhl7attachmentrequest', 'displayname',
];

// Loinc.csv is ~80 MB in recent releases. Refuse anything implausibly small —
// catches users pointing at the wrong folder or a partially extracted archive.
const MIN_LOINC_CSV_BYTES = 10_000_000;

function preflight(): void {
  const required = [
    { path: LOINC_CSV, label: 'Loinc.csv' },
    { path: MAPTO_CSV, label: 'MapTo.csv' },
    { path: CONSUMER_CSV, label: 'ConsumerName.csv' },
  ];
  const missing = required.filter((f) => !existsSync(f.path));
  if (missing.length > 0) {
    console.error(`Missing required LOINC files under ${inputDir}:`);
    for (const f of missing) console.error(`  - ${f.label} (expected at ${f.path})`);
    console.error('\nExpected layout (matches the LOINC.org distribution):');
    console.error('  <folder>/LoincTable/Loinc.csv');
    console.error('  <folder>/LoincTable/MapTo.csv');
    console.error('  <folder>/AccessoryFiles/ConsumerName/ConsumerName.csv');
    process.exit(1);
  }

  const size = statSync(LOINC_CSV).size;
  if (size < MIN_LOINC_CSV_BYTES) {
    console.error(
      `${LOINC_CSV} is ${size} bytes — too small to be the LOINC table. ` +
        `Refusing to wipe the database with a likely-incomplete download.`
    );
    process.exit(1);
  }
}

async function main() {
  preflight();

  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error('DATABASE_URL_UNPOOLED is required (direct Neon URL).');

  // Print the target host (no password) before we connect so an operator
  // running this against production sees which Neon branch is about to be
  // truncated even if the connection itself fails.
  const parsed = new URL(url);
  const target = `${parsed.username}@${parsed.host}${parsed.pathname}`;
  console.log(`Importing LOINC from: ${inputDir}`);
  console.log(`Target:               ${target}`);

  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();

  const started = Date.now();

  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE loinc, map_to, consumer_names RESTART IDENTITY');

    console.log('Loading loinc…');
    await client.query('DROP TABLE IF EXISTS loinc_raw');
    await client.query(`
      CREATE TEMP TABLE loinc_raw (
        ${LOINC_RAW_COLUMNS.map((c) => `${c} TEXT`).join(',\n        ')}
      )
    `);
    await copyCsv(
      client,
      `COPY loinc_raw FROM STDIN WITH (FORMAT csv, HEADER true)`,
      LOINC_CSV
    );
    await client.query(`
      INSERT INTO loinc (
        loinc_num, component, property, time_aspct, system, scale_typ, method_typ,
        class, status, shortname, long_common_name, related_names,
        example_units, ucum_units, definition,
        version_first_released, version_last_changed,
        external_copyright_notice,
        common_test_rank, common_order_rank, classtype
      )
      SELECT
        loinc_num, component, property, time_aspct, system, scale_typ, method_typ,
        class, status, shortname, long_common_name, relatednames2,
        example_units, example_ucum_units, definition_description,
        version_first_released, version_last_changed,
        NULLIF(external_copyright_notice, ''),
        NULLIF(common_test_rank, '')::int,
        NULLIF(common_order_rank, '')::int,
        NULLIF(classtype, '')::int
      FROM loinc_raw
    `);
    await client.query('DROP TABLE loinc_raw');

    // Stage map_to and consumer_names through TEMP tables whose column names
    // match the LOINC CSV headers (case-insensitively), then INSERT … SELECT
    // into our schema-named columns. HEADER MATCH (PG 16+) validates header
    // names against the temp table at COPY time so a future LOINC release
    // reordering or renaming columns errors loudly instead of silently
    // mismapping. The main `loinc` import does the same staging dance above
    // (without HEADER MATCH because our snake_case names don't match LOINC's
    // mixed-case header names there).
    // HEADER MATCH is case-sensitive, so the temp table columns are quoted
    // identifiers matching the LOINC CSV header case verbatim.
    console.log('Loading map_to…');
    await client.query('DROP TABLE IF EXISTS map_to_raw');
    await client.query(`
      CREATE TEMP TABLE map_to_raw (
        "LOINC" TEXT, "MAP_TO" TEXT, "COMMENT" TEXT
      )
    `);
    await copyCsv(
      client,
      `COPY map_to_raw FROM STDIN WITH (FORMAT csv, HEADER MATCH)`,
      MAPTO_CSV
    );
    await client.query(`
      INSERT INTO map_to (source_code, target_code, comment)
      SELECT "LOINC", "MAP_TO", NULLIF("COMMENT", '') FROM map_to_raw
    `);
    await client.query('DROP TABLE map_to_raw');

    console.log('Loading consumer_names…');
    await client.query('DROP TABLE IF EXISTS consumer_names_raw');
    await client.query(`
      CREATE TEMP TABLE consumer_names_raw (
        "LoincNumber" TEXT, "ConsumerName" TEXT
      )
    `);
    await copyCsv(
      client,
      `COPY consumer_names_raw FROM STDIN WITH (FORMAT csv, HEADER MATCH)`,
      CONSUMER_CSV
    );
    await client.query(`
      INSERT INTO consumer_names (loinc_num, consumer_name)
      SELECT "LoincNumber", "ConsumerName" FROM consumer_names_raw
    `);
    await client.query('DROP TABLE consumer_names_raw');

    // Denormalize consumer names onto loinc so they feed search_text /
    // search_vector (recall), not just the ranking subquery. Must run after
    // consumer_names is loaded; the generated columns recompute on this UPDATE.
    console.log('Folding consumer names into search text…');
    await client.query(`
      UPDATE loinc l SET consumer_names_text = sub.names
      FROM (
        SELECT loinc_num, string_agg(consumer_name, ' ') AS names
        FROM consumer_names GROUP BY loinc_num
      ) sub
      WHERE sub.loinc_num = l.loinc_num
    `);

    await client.query('COMMIT');

    // ANALYZE outside the transaction so the planner picks up new stats immediately
    // and so a failure here doesn't roll back the loaded data.
    console.log('ANALYZE…');
    await client.query('ANALYZE loinc');
    await client.query('ANALYZE map_to');
    await client.query('ANALYZE consumer_names');

    const counts = await client.query<{ tbl: string; n: string }>(`
      SELECT 'loinc' AS tbl, count(*)::text AS n FROM loinc
      UNION ALL SELECT 'map_to', count(*)::text FROM map_to
      UNION ALL SELECT 'consumer_names', count(*)::text FROM consumer_names
    `);
    console.log('Row counts:');
    for (const r of counts.rows) console.log(`  ${r.tbl}: ${r.n}`);
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function copyCsv(client: PoolClient, copySql: string, csvPath: string) {
  const sink = client.query(copyFrom(copySql));
  await pipeline(createReadStream(csvPath), sink);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
