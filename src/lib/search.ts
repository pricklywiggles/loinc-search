import { sql } from './db';
import type { LookupResult, SearchResult } from '@/types/loinc';

// Prefix matching (`:*` per token) so a search for "egfr" matches packed tokens
// like "egfrcr" via @@. Without it, the @@ side returns nothing for kidney
// eGFR rows and the ranking is dominated by exact-token oncology EGFR matches.
function buildPrefixTsQuery(q: string): string | null {
  const tokens = q.match(/[A-Za-z0-9]+/g);
  if (!tokens || tokens.length === 0) return null;
  return tokens.map((t) => `${t.toLowerCase()}:*`).join(' & ');
}

export async function searchLoinc(q: string): Promise<SearchResult[]> {
  const tsq = buildPrefixTsQuery(q);
  if (!tsq) return [];

  const rows = await sql`
    WITH q AS (
      SELECT to_tsquery('english', ${tsq}) AS tsq, ${q}::text AS raw
    )
    SELECT
      l.loinc_num,
      l.component,
      l.shortname,
      l.long_common_name,
      l.system,
      l.example_units,
      l.ucum_units,
      l.status,
      l.external_copyright_notice,
      (
        3.0 * ts_rank(l.search_vector, q.tsq)
        + 1.0 * similarity(l.search_text, q.raw)
        + 2.0 * COALESCE((
            SELECT MAX(
              similarity(c.consumer_name, q.raw)
              * (1.0 + 30.0 / GREATEST(char_length(c.consumer_name), 10))
            )
            FROM consumer_names c
            WHERE c.loinc_num = l.loinc_num
          ), 0)
      ) * CASE WHEN l.status = 'TRIAL' THEN 0.5 ELSE 1.0 END AS score
    FROM loinc l, q
    WHERE l.status IN ('ACTIVE', 'TRIAL')
      AND (l.search_vector @@ q.tsq OR l.search_text % q.raw)
    ORDER BY score DESC
    LIMIT 20
  `;
  return rows as unknown as SearchResult[];
}

type LookupRow = {
  source: string;
  was_aliased: boolean;
  original_comment: string | null;
  loinc_num: string | null;
  component: string | null;
  property: string | null;
  time_aspct: string | null;
  system: string | null;
  scale_typ: string | null;
  method_typ: string | null;
  class: string | null;
  status: LookupResult['status'] | null;
  shortname: string | null;
  long_common_name: string | null;
  related_names: string | null;
  example_units: string | null;
  ucum_units: string | null;
  definition: string | null;
  version_first_released: string | null;
  version_last_changed: string | null;
  external_copyright_notice: string | null;
  consumer_names: string[];
};

function rowToLookupResult(row: LookupRow): LookupResult | null {
  if (!row.loinc_num) return null;
  const result: LookupResult = {
    loinc_num: row.loinc_num,
    component: row.component!,
    property: row.property!,
    time_aspct: row.time_aspct!,
    system: row.system!,
    scale_typ: row.scale_typ!,
    method_typ: row.method_typ,
    class: row.class!,
    status: row.status!,
    shortname: row.shortname,
    long_common_name: row.long_common_name,
    related_names: row.related_names,
    example_units: row.example_units,
    ucum_units: row.ucum_units,
    definition: row.definition,
    version_first_released: row.version_first_released,
    version_last_changed: row.version_last_changed,
    external_copyright_notice: row.external_copyright_notice,
    consumer_names: row.consumer_names,
  };
  if (row.was_aliased) {
    result.deprecated_alias = {
      source_code: row.source,
      comment: row.original_comment,
    };
  }
  return result;
}

// Depth bound of 10 covers LOINC 2.82's 32 multi-hop alias chains with margin.
export async function lookupLoincMany(
  codes: string[]
): Promise<Array<LookupResult | null>> {
  if (codes.length === 0) return [];

  const rows = (await sql`
    WITH RECURSIVE input AS (
      SELECT code, pos
      FROM unnest(${codes}::text[]) WITH ORDINALITY AS t(code, pos)
    ),
    chain AS (
      SELECT i.code AS original_source, m.target_code, m.comment AS original_comment, 1 AS depth
      FROM input i
      JOIN map_to m ON m.source_code = i.code
      UNION ALL
      SELECT c.original_source, m.target_code, c.original_comment, c.depth + 1
      FROM map_to m
      JOIN chain c ON m.source_code = c.target_code
      WHERE c.depth < 10
    ),
    final_chain AS (
      SELECT DISTINCT ON (original_source) original_source, target_code, original_comment
      FROM chain
      ORDER BY original_source, depth DESC
    )
    SELECT
      i.code AS source,
      fc.target_code IS NOT NULL AS was_aliased,
      fc.original_comment,
      l.loinc_num, l.component, l.property, l.time_aspct, l.system, l.scale_typ,
      l.method_typ, l.class, l.status, l.shortname, l.long_common_name, l.related_names,
      l.example_units, l.ucum_units, l.definition,
      l.version_first_released, l.version_last_changed, l.external_copyright_notice,
      COALESCE(cn.consumer_names, '{}'::text[]) AS consumer_names
    FROM input i
    LEFT JOIN final_chain fc ON fc.original_source = i.code
    LEFT JOIN loinc l ON l.loinc_num = COALESCE(fc.target_code, i.code)
    LEFT JOIN LATERAL (
      SELECT array_agg(consumer_name) AS consumer_names
      FROM consumer_names
      WHERE loinc_num = COALESCE(fc.target_code, i.code)
    ) cn ON true
    ORDER BY i.pos
  `) as unknown as LookupRow[];

  return rows.map(rowToLookupResult);
}

export async function lookupLoinc(code: string): Promise<LookupResult | null> {
  const [result] = await lookupLoincMany([code]);
  return result ?? null;
}
