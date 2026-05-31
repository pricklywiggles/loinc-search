// Acceptance-gate runner for the LOINC search fixture.
//
// Reads fixtures/loinc-search-acceptance.json, queries the search API, and
// reports recall@20, top-1 rate, and rank-of-canonical so a ranking change can
// be measured before/after. Honors the fixture's reject and name_unit_conflict
// semantics. Runs on plain node (global fetch) — no project deps required.
//
//   node scripts/eval-search.mjs [--base https://loinc.fractal.ly] [--fixture path]
//
// FROZEN-GATE REMINDER: do not tune ranking weights against this file; it is a
// held-out acceptance check, not a tuning objective.

import { readFileSync } from 'node:fs';

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// Defaults to localhost so a bare run doesn't silently fire 57 queries at prod;
// pass --base https://loinc.fractal.ly explicitly to hit a deployment.
const BASE = arg('--base', 'http://localhost:3000').replace(/\/$/, '');
const FIXTURE = arg('--fixture', 'fixtures/loinc-search-acceptance.json');
const WINDOW = 20; // mirrors the LIMIT 20 in searchLoinc (src/lib/search.ts)

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const rows = fixture.rows;

if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
  console.warn(`\n⚠  Querying a NON-LOCAL target with ${rows.length} requests: ${BASE}\n`);
}

// name_unit_conflict and empty-unit rows are scored name-recall only: the unit
// is intentionally withheld so a correct dimension gate isn't penalized.
function isNameOnly(row) {
  return (row.controls ?? []).includes('name_unit_conflict') || !row.unit;
}

function buildItem(row) {
  return isNameOnly(row) ? { q: row.query } : { q: row.query, unit: row.unit };
}

async function runBatch(items) {
  const res = await fetch(`${BASE}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`batch failed: ${res.status} ${await res.text()}`);
  return (await res.json()).items;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const responses = [];
for (const c of chunk(rows.map(buildItem), 50)) {
  const out = await runBatch(c);
  if (out.length !== c.length) {
    throw new Error(`batch length mismatch: sent ${c.length}, received ${out.length}`);
  }
  responses.push(...out);
}

const evaluated = rows.map((row, i) => {
  const results = responses[i]?.results ?? [];
  const order = results.map((r) => r.loinc_num);
  const accept = [row.expected_loinc, ...(row.alt ?? [])];
  const rankOf = (code) => {
    const idx = order.indexOf(code);
    return idx === -1 ? Infinity : idx + 1;
  };
  const bestRank = Math.min(...accept.map(rankOf));
  const rejectRank = Math.min(
    Infinity,
    ...(row.reject ?? []).map(rankOf)
  );
  return {
    row,
    nameOnly: isNameOnly(row),
    unitFilterApplied: responses[i]?.unitFilterApplied,
    bestRank,
    present: Number.isFinite(bestRank),
    top1: bestRank === 1,
    rejectViolation: rejectRank <= bestRank && Number.isFinite(rejectRank),
    returned: order.length,
  };
});

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(0)}%` : 'n/a';
}

const present = evaluated.filter((e) => e.present);
// Zero results for a real analyte usually means a server-side per-item error
// (route.ts returns {results: []} for a failed batch item), not a true no-match
// — surface it instead of silently folding it into the recall miss count.
const empty = evaluated.filter((e) => e.returned === 0).length;
const ranks = present.map((e) => e.bestRank).sort((a, b) => a - b);
const mean = ranks.length
  ? (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(2)
  : 'n/a';
const mid = Math.floor(ranks.length / 2);
const median = !ranks.length
  ? 'n/a'
  : ranks.length % 2
    ? ranks[mid]
    : (ranks[mid - 1] + ranks[mid]) / 2;

console.log(`\nLOINC search acceptance — ${BASE}  (${rows.length} rows)\n`);
console.log('Rows needing attention (absent, rank>1, or reject violation):');
console.log(
  '  rk  rej  uFA   expected   query / unit'.padEnd(10) + '  [controls]'
);
for (const e of evaluated) {
  if (e.present && e.top1 && !e.rejectViolation) continue;
  const rk = e.present ? String(e.bestRank).padStart(2) : ' ✗';
  const rej = e.rejectViolation ? 'REJ' : '  .';
  const uFA = e.unitFilterApplied === undefined ? ' - ' : e.unitFilterApplied ? ' ✓ ' : ' ✗ ';
  const u = e.nameOnly ? '(name-only)' : e.row.unit;
  console.log(
    `  ${rk}  ${rej}  ${uFA}  ${e.row.expected_loinc.padEnd(9)}  ${e.row.query} / ${u}  [${(e.row.controls ?? []).join(',')}]`
  );
}

console.log('\nSummary');
console.log(`  recall@${WINDOW} (expected/alt present): ${present.length}/${rows.length}  (${pct(present.length, rows.length)})`);
console.log(`  top-1:                               ${evaluated.filter((e) => e.top1).length}/${rows.length}  (${pct(evaluated.filter((e) => e.top1).length, rows.length)})`);
console.log(`  absent from window:                  ${rows.length - present.length}`);
console.log(`  empty result sets (possible errors): ${empty}`);
console.log(`  reject violations:                   ${evaluated.filter((e) => e.rejectViolation).length}`);
console.log(`  rank-of-canonical (present rows):    mean ${mean}, median ${median}`);

const unitRows = evaluated.filter((e) => !e.nameOnly);
const applied = unitRows.filter((e) => e.unitFilterApplied === true).length;
console.log(`  unitFilterApplied on unit rows:      ${applied}/${unitRows.length}`);
