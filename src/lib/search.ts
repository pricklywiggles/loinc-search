import { sql } from './db';
import type { LookupResult, SearchResult } from '@/types/loinc';

/**
 * Build a tsquery string from freeform user input using prefix matching on
 * every token. Returns null when the input contains no usable tokens.
 *
 * Why prefix matching: many LOINC shortnames pack multiple concepts into a
 * single token (e.g. "eGFRcr"). Without `:*`, a search for "egfr" misses
 * those rows entirely via @@ and only catches them through trigram fallback,
 * which produces no ts_rank signal and lets less-relevant exact-token matches
 * (e.g. oncology "EGFR c.2369C>T") dominate.
 */
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

export async function lookupLoinc(code: string): Promise<LookupResult | null> {
  const aliasRows = (await sql`
    SELECT source_code, target_code, comment
    FROM map_to
    WHERE source_code = ${code}
    LIMIT 1
  `) as unknown as Array<{ source_code: string; target_code: string; comment: string | null }>;

  const alias = aliasRows[0];
  const targetCode = alias?.target_code ?? code;

  const loincRows = (await sql`
    SELECT
      loinc_num, component, property, time_aspct, system, scale_typ, method_typ,
      class, status, shortname, long_common_name, related_names,
      example_units, ucum_units, definition,
      version_first_released, version_last_changed,
      external_copyright_notice
    FROM loinc
    WHERE loinc_num = ${targetCode}
    LIMIT 1
  `) as unknown as Array<Omit<LookupResult, 'consumer_names' | 'deprecated_alias'>>;

  const row = loincRows[0];
  if (!row) return null;

  const synRows = (await sql`
    SELECT consumer_name FROM consumer_names WHERE loinc_num = ${targetCode}
  `) as unknown as Array<{ consumer_name: string }>;

  const result: LookupResult = {
    ...row,
    consumer_names: synRows.map((r) => r.consumer_name),
  };
  if (alias) {
    result.deprecated_alias = { source_code: alias.source_code, comment: alias.comment };
  }
  return result;
}
