# LOINC Search

**Live: [loinc.fractal.ly](https://loinc.fractal.ly)**

Searchable web app for the [LOINC](https://loinc.org/) codebook. Type a name (`blood urea nitrogen`), a synonym (`GFR, Blood`), or a LOINC code (`98979-8`) and the app returns the matching record. Deprecated codes auto-redirect to their active replacement.

Built with Next.js 16 (App Router), TypeScript, TailwindCSS, and Neon Postgres (`pg_trgm` + `tsvector` for ranked full-text + trigram search). Source code is MIT-licensed; see [LICENSE](LICENSE). LOINC and UCUM data surfaced by the app remain under their own licenses; see [NOTICE](NOTICE).

If you found this useful, buy me a coffee...

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/L3L81X4KW7)
---

## Quick start

```bash
pnpm install
psql "$DATABASE_URL_UNPOOLED" -f schema.sql        # create tables and indices
pnpm import-loinc --env dev docs                    # load CSVs (non-interactive)
pnpm dev                                            # http://localhost:3000
```

Requirements: pnpm 10+, Node 20+, `psql`, [`gum`](https://github.com/charmbracelet/gum) (only for interactive `pnpm import-loinc` runs — `brew install gum`), and a Neon Postgres project with `pg_trgm` available (free tier works).

### Environment

`.env.local` (gitignored):

```
DATABASE_URL=postgresql://…-pooler.<region>.aws.neon.tech/<db>?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://…<region>.aws.neon.tech/<db>?sslmode=require
```

- `DATABASE_URL` — pooled URL (used by the Next.js API routes via `@neondatabase/serverless`).
- `DATABASE_URL_UNPOOLED` — direct URL (used by `psql` and the import script for `COPY FROM STDIN`).

### LOINC distribution

LOINC is not redistributable. Download the latest table release from <https://loinc.org/downloads/> (free with a LOINC account) and extract it into `docs/` (gitignored). The script expects the standard layout:

```
docs/
├── LoincTable/
│   ├── Loinc.csv
│   └── MapTo.csv
└── AccessoryFiles/
    └── ConsumerName/
        └── ConsumerName.csv
```

---

## Refreshing the database with a new LOINC release

`pnpm import-loinc` wraps the importer in an interactive [gum](https://github.com/charmbracelet/gum) CLI. Dev and prod live in **separate Neon projects** so their storage is independent; two env files select between them:

| File | Loaded when you pick / pass | What it should contain |
| --- | --- | --- |
| `.env.local`            | `--env dev`  | Dev Neon **project** credentials. |
| `.env.production.local` | `--env prod` | Production Neon **project** credentials (gitignored, only present on the operator's machine). On Vercel: `pnpm dlx vercel env pull .env.production.local`. |

### Usage

```bash
pnpm import-loinc                              # interactive: pick env + folder
pnpm import-loinc --env dev                    # dev creds, prompt for folder
pnpm import-loinc --env prod /tmp/loinc-2.83   # fully non-interactive
pnpm import-loinc --help                       # full flag reference
```

Behaviour:

- **Both flags supplied** (`--env` *and* a folder) → no prompts at all, runs straight through. The path for CI or scripted refreshes.
- **`--env` omitted** → if both env files are present, gum prompts you to pick. If only one is present, it auto-selects and announces which.
- **Folder omitted** → gum asks for it; press Enter to default to `./docs`.
- **`--env prod` in interactive mode** → an extra "This will TRUNCATE production. Proceed?" confirmation appears before anything destructive. Skipped if you supplied both flags up front.

`gum` is required only for the interactive paths. Non-interactive runs (both flags) work without it — useful when running in CI containers that don't ship gum.

### What it does

1. **Pre-flights** the folder — verifies `LoincTable/Loinc.csv`, `LoincTable/MapTo.csv`, and `AccessoryFiles/ConsumerName/ConsumerName.csv` exist, and that `Loinc.csv` is plausibly sized (≥10 MB) so a partial extract can't silently wipe the database.
2. Opens a transaction, **`TRUNCATE`s** the three tables, and streams the new CSVs via `COPY FROM STDIN` (`pg-copy-streams`). ~109 K LOINC + 4.6 K MapTo + 67 K consumer rows in ~60 seconds.
3. **`COMMIT`s** — until this point the old data remains visible to other connections; on any failure, `ROLLBACK` leaves the previous version intact.
4. Runs `ANALYZE`, prints final row counts.

Every run prints the target host before connecting, so you can confirm what's about to be truncated:

```
LOINC import → prod
  Env file: .env.production.local
  Folder:   /tmp/loinc-2.83

Importing LOINC from: /tmp/loinc-2.83
Target:               neondb_owner@ep-mossy-…neon.tech/neondb
```

> **Note on the script name.** `pnpm import` is a built-in pnpm command (it generates `pnpm-lock.yaml` from npm/yarn lockfiles), so the script is named `import-loinc` to avoid the conflict.

### Production refresh — in-place atomic refresh

The recommended workflow for this project is an **in-place atomic refresh** against the production branch:

1. **Capture prod credentials** into `.env.production.local` once. On Vercel: `pnpm dlx vercel env pull .env.production.local`.
2. **Run the import non-interactively** against prod:
    ```bash
    pnpm import-loinc --env prod /path/to/loinc-2.83
    ```
   Verify the `LOINC import → prod` banner and the `Target:` line before the `TRUNCATE` runs.
3. **Smoke-check the live site** afterwards — the import takes ~60 s, then `ANALYZE` runs and the new statistics are immediately live.

The `TRUNCATE`+`COPY`+`COMMIT` runs inside a single transaction: until `COMMIT` the old rows remain visible to readers, and any failure mid-import rolls back automatically. So in-place is safe even though it skips a verification window.

**Why not a branch-and-promote workflow?** A fully-loaded LOINC dataset is ~242 MB (218 MB `loinc` heap + indexes, 15 MB `consumer_names`, etc.), and Neon's Free plan caps storage at **500 MB per project**. Dev and prod live in **separate projects**, each holding a single fully-loaded copy (~242 MB) — comfortably under the cap, but with no room to keep a second diverged copy alongside it (a copy-on-write branch starts at ~0, but a `TRUNCATE`+`COPY` fully diverges it to ~242 MB, pushing that project toward ~484 MB). The in-place refresh above avoids the second copy entirely. If you upgrade to Launch, you can revisit branch-and-promote (create branch → import → verify → promote). Because dev is its own project — not a copy-on-write child of prod — refreshing dev just means re-running `pnpm import-loinc --env dev` against the LOINC CSVs.

**Don't keep prod creds on a laptop long-term.** The portable upgrade is a manually-triggered GitHub Action that runs `pnpm import-loinc --env prod <folder>` with `DATABASE_URL_UNPOOLED` from repo secrets. Not included in this repo yet.

### Schema changes between LOINC releases

`schema.sql` only depends on a stable subset of the LOINC columns (`LOINC_NUM`, `COMPONENT`, `STATUS`, `SHORTNAME`, `LONG_COMMON_NAME`, `RELATEDNAMES2`, etc.). The import script stages the full row set into a `TEMP TABLE loinc_raw` (40 columns) before `INSERT … SELECT`-ing the trimmed set into `loinc`, so new optional columns in a LOINC release don't break the import. If LOINC ever renames or removes one of the columns we depend on, `COPY` will fail with a clear error and roll back.

---

## Project layout

```
loinc-search/
├── schema.sql                       Tables, GIN indices, generated tsvector/search_text columns
├── scripts/
│   ├── import-loinc.sh              Interactive gum wrapper (entrypoint for pnpm import-loinc)
│   └── import-loinc.ts              Underlying TypeScript importer (TRUNCATE + COPY FROM STDIN)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── search/route.ts      GET /api/search?q=… (single, optional &unit=) + POST /api/search (batch)
│   │   │   └── loinc/route.ts       GET /api/loinc?code=… (single or batch, zod-validated)
│   │   ├── layout.tsx
│   │   └── page.tsx                 Single-input search UI
│   ├── components/                  SearchInput, ResultCard, SingleResultView, StatusBadge, …
│   ├── lib/
│   │   ├── db.ts                    @neondatabase/serverless sql template tag
│   │   └── search.ts                Ranking SQL + deprecated-code lookup
│   └── types/loinc.ts               Shared response types
├── next.config.ts                   Security headers (HSTS, CSP, X-Frame-Options, …)
└── package.json
```

---

## Ranking model

`src/lib/search.ts` runs a single query that combines three signals:

| Weight | Signal | Why |
| --- | --- | --- |
| 3.0 | `ts_rank(search_vector, prefix_tsquery)` | English-stemmed token match on `component`, `shortname`, `long_common_name`, `related_names`. Tokens get `:*` prefix wildcards so e.g. `egfr` matches the token `egfrcr` packed into kidney-eGFR shortnames — not just exact `EGFR` tokens in oncology mutation codes. |
| 1.0 | `similarity(search_text, raw_query)` | Trigram fuzziness for typos and partial matches. |
| 2.0 | Length-normalized `MAX(similarity(consumer_name, raw_query))` | Synonym match against the `consumer_names` table. Short consumer names (e.g. `"GFR, Blood"`) get a higher weight than long technical descriptors (e.g. `"EGFR gene c.2573T>G, Blood or tissue specimen"`), because short focused synonyms are stronger signals of layperson relevance. |

`DEPRECATED` and `DISCOURAGED` codes are **hard-excluded** from search via `WHERE status IN ('ACTIVE','TRIAL')`. `TRIAL` rows are included but their final score is halved so they sink below comparable `ACTIVE` rows. Status is always returned in the API payload so the UI can render a `TRIAL` callout.

For lookup (paste a code), `lookupLoinc(code)` resolves one hop through `map_to` so paste-a-deprecated-code transparently lands on the active replacement, with `deprecated_alias.source_code` populated so the UI can show a "you searched X, here's its replacement Y" banner.

---

## API

Two read-only resources: `/api/search` (free-text + optional unit filter) and `/api/loinc` (exact-code lookup). Each exposes a **single-input** form and a **batch** form. The batch surfaces differ: `/api/search` uses `POST` with a JSON body, `/api/loinc` uses repeated/comma-separated `code` params on `GET`.

Per-item validation failures behave differently between the two modes: single-input is strict (invalid input → `400`), batch is lenient (invalid item → `null`/`[]`/`{ results: [] }` in that slot, rest of the batch still resolves). Structural failures — missing param entirely, malformed JSON, or batch over the cap — always return `400`. Cap is **50 items per request** on both endpoints.

`GET` responses include `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. `POST /api/search` is uncached (only `GET` is cacheable in this framework, and a batch wouldn't benefit anyway).

### `GET /api/search?q=…&unit=…`

Free-text search ranked over `component`, `shortname`, `long_common_name`, `related_names`, with a synonym signal from `consumer_names` (see [Ranking model](#ranking-model)). When `q` matches `^\d{1,7}-\d$` the server transparently routes to lookup so paste-a-code returns the full record. `q` is zod-validated as 1–200 chars after trim; `unit`, if present, is 1–50 chars after trim.

The response is always wrapped: `{ results, unitFilterApplied? }`. `unitFilterApplied` is **omitted** when no `unit` was sent or when `q` was a code (codes don't use the hint); `true` when the filter ran and kept rows, or when both the filtered and unfiltered queries returned nothing (the unit wasn't the cause of emptiness); `false` only when the filter emptied the candidate set *and* the unfiltered fallback found rows.

```
GET /api/search?q=blood+urea+nitrogen
→ 200  { results: SearchResult[] }                      # up to 20, ranked desc by score

GET /api/search?q=98979-8                                # auto-routed to lookup
→ 200  { results: [LookupResult] }                       # 0- or 1-element array

GET /api/search?q=PSA&unit=ng%2FmL                       # unit hint applied
→ 200  { results: SearchResult[], unitFilterApplied: true }

GET /api/search?q=PSA&unit=parsec%2Fmol                  # hint excludes everything
→ 200  { results: SearchResult[], unitFilterApplied: false }   # fell back to unfiltered

GET /api/search                                          # missing q
GET /api/search?q=                                       # empty after trim
GET /api/search?q=<201 chars>                            # too long
→ 400  { error: "Invalid query" }

GET /api/search?q=PSA&unit=<51 chars>                    # unit too long
→ 400  { error: "Invalid unit" }
```

The unit hint matches against both `ucum_units` and `example_units`. `ucum_units` (from LOINC's `EXAMPLE_UCUM_UNITS`) is canonically `;`-delimited when it carries multiple values, so the `;`-split is reliable there. `example_units` is freer-form; the filter `;`-splits it on the same convention as a best effort, but a row that happens to pack multiple values with a different separator would be missed. Both sides are normalized before comparison: lowercased, Greek mu (`μ`, `µ`) → `u`, `mcg` → `ug`. So `ng/mL`, `NG/ML`, `mcg/L`, `μg/L`, and `µg/L` all match the strings LOINC publishes — but `ug/L` and `ng/mL` are **not** treated as equivalent (same dimension, different orders of magnitude); the hint is literal modulo aliasing, not unit-algebra.

### `POST /api/search`

> **Breaking change.** Replaces the previous repeated-`q` GET batch form. `GET /api/search` no longer reads more than one `q` — extra values are ignored.

Batch search. Request body is JSON: `{ items: [{ q, unit? }, ...] }` (1–50 items). Per-item processing is independent and runs with a bounded fan-out (8 concurrent DB calls). Results are returned in input order. Validation is **per-item lenient** to match `/api/loinc` batch behavior: a malformed item (missing/oversized `q`, oversized `unit`, wrong types) collapses to `{ results: [] }` in its slot rather than failing the whole batch.

```
POST /api/search
Content-Type: application/json

{ "items": [
    { "q": "PSA", "unit": "ng/mL" },
    { "q": "cortisol" },
    { "q": "2857-1" }
]}

→ 200  { items: [
    { results: SearchResult[], unitFilterApplied: true },
    { results: SearchResult[] },
    { results: [LookupResult] }
]}
```

```
POST /api/search   (malformed JSON body)              → 400 { error: "Invalid JSON body" }
POST /api/search   (missing items, empty items, > 50 items, items not an array of objects)
                                                      → 400 { error: "Invalid body (...)" }
```

Per-item failures — either a validation rejection on the item or a DB error during its query — collapse to `{ results: [] }` for that slot. Runtime failures are logged server-side; validation rejections are silent. The rest of the batch still resolves. A batch where **every** item rejects at runtime returns `500` (almost always an outage; surfacing it loudly so callers can't mistake it for "no results").

### `GET /api/loinc?code=…`

Exact-code lookup. Resolves through `map_to` (multi-hop, depth-bounded at 10) so a deprecated code lands on its active replacement with `deprecated_alias.source_code` populated. Joins `consumer_names`. Each code is validated against `^\d{1,7}-\d$`.

**Single-input**

```
GET /api/loinc?code=98979-8
→ 200  LookupResult

GET /api/loinc?code=1009-0                     # deprecated → active replacement
→ 200  LookupResult                            # deprecated_alias.source_code = "1009-0"

GET /api/loinc?code=00000-0                    # valid format, no row
→ 404  { error: "Not found" }

GET /api/loinc                                 # missing
GET /api/loinc?code=notacode                   # invalid format
→ 400  { error: "Invalid LOINC code" }
```

**Batch** — repeat the `code` param, comma-separate, or mix freely. Empty fragments from stray or trailing commas are dropped before validation, so `?code=A,` is equivalent to `?code=A` (single-input contract, not a phantom 2-element batch).

```
GET /api/loinc?code=98979-8&code=1009-0
GET /api/loinc?code=98979-8,1009-0
GET /api/loinc?code=98979-8,1009-0&code=00000-0
→ 200  (LookupResult | null)[]                 # one slot per input, in input order

GET /api/loinc?code=98979-8&code=notacode      # second code invalid
→ 200  [LookupResult, null]                    # null = "couldn't resolve"

GET /api/loinc?code=<51 codes>
→ 400  { error: "Too many codes (max 50)" }
```

`null` in a batch slot means **could not resolve** — the input was malformed, there's no matching row, *or* the lookup hit a transient backend error (logged server-side). To separate malformed input from the rest, pre-validate against `^\d{1,7}-\d$`. Note the asymmetry with single-input: per-item failures are swallowed in batch mode, so a backend outage degrades a batch request to `200` with every slot `null` instead of the `500` the single-input path returns — don't treat an all-`null` batch as authoritative absence.

### Response types

```ts
type LoincStatus = 'ACTIVE' | 'TRIAL' | 'DEPRECATED' | 'DISCOURAGED';

interface SearchResult {
  loinc_num: string;
  component: string;
  shortname: string | null;
  long_common_name: string | null;
  related_names: string | null;
  property: string;
  system: string;
  scale_typ: string;
  example_units: string | null;
  ucum_units: string | null;
  status: LoincStatus;
  external_copyright_notice: string | null;
  score: number;
}

interface LookupResult {
  loinc_num: string;
  component: string;
  property: string;
  time_aspct: string;
  system: string;
  scale_typ: string;
  method_typ: string | null;
  class: string;
  status: LoincStatus;
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
  deprecated_alias?: {
    source_code: string;
    comment: string | null;
  };
}
```

The canonical definitions live in [`src/types/loinc.ts`](src/types/loinc.ts).

---

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the Next.js dev server at <http://localhost:3000>. |
| `pnpm build` | Production build. |
| `pnpm start` | Serve the production build. |
| `pnpm test` | Run the vitest suite against the Neon dev project (reads `.env.local`). |
| `pnpm lint` | ESLint. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm import-loinc [--env dev\|prod] [folder]` | Refresh the database from a LOINC distribution folder. Interactive when args are missing; non-interactive when both `--env` and folder are supplied. |

---

## Tests

Two suites, both run against the Neon dev project via `pnpm test`:

- **`src/lib/normalize-unit.test.ts`** — unit-string normalizer: case folding, Greek mu / micro sign → `u`, `mcg` → `ug`, caret powers (`10^6` → `10*6`), `mEq/L` → `mmol/L` (valence-blind by design), internal whitespace preserved, null/empty inputs; plus a TS↔SQL parity check binding `normalizeUnit` to the Postgres `loinc_normalize_unit()` so the two can't drift.
- **`src/lib/search.test.ts`** — `searchLoinc` and `lookupLoinc` against real data: `egfr` ranks kidney CKD-EPI 2021 codes above oncology EGFR mutations; `DEPRECATED`/`DISCOURAGED` rows are excluded from search; `TRIAL` rows score half; deprecated codes redirect to their target with `deprecated_alias.source_code` populated; unknown codes return `null`; a `ng/mL` unit hint surfaces total-PSA (`2857-1`) which is otherwise buried past `LIMIT 20`; `common_test_rank` lifts the common WBC count (`6690-2`) over rarer variants, with `loinc_common_test_boost()` bounds-checked directly (unranked → `1.0`, clamped, monotonic); the dimension gate keeps the general nucleated-RBC ratio (`58413-6`) above the fetal variant for a `/100 WBC` hint, and `loinc_unit_class()` / `loinc_property_class()` are checked to agree on dimension class.
- **`src/app/api/routes.test.ts`** — API route handlers called directly with `Request` objects: single-input validation (400 on missing/invalid/too-long input), 404 on unknown codes, 200 with proper response shape and `Cache-Control` headers, search auto-routes to lookup when `q` matches the LOINC code pattern, GET unit hint filter + fallback semantics, POST batch shape and per-item unit threading, `/api/loinc` batch (repeated params, comma-separated codes, per-item `null` for invalid entries, 400 when over the 50-item cap).

---

## Licensing & attribution

The source code in this repository is released under the [MIT License](LICENSE).

**LOINC and UCUM are *not* MIT-licensed.** This application surfaces content from both, so any deployment must retain their attribution:

- **LOINC** — content is copyright © Regenstrief Institute, Inc. and the LOINC Committee, available at no cost under the license at [loinc.org/license](https://loinc.org/license). LOINC® is a registered United States trademark of Regenstrief Institute, Inc. The running app's footer and `/about` page reproduce LOINC's required attribution notice (LOINC license §10).
- **Per-record third-party content** — ~6.7% of LOINC records carry an additional copyright notice (in the `EXTERNAL_COPYRIGHT_NOTICE` field) from third parties such as AORN Syntegrity, copyright holders of survey instruments, etc. The schema stores this column and the UI renders it on result cards and the single-record view for any code that has one.
- **UCUM** — the application stores and displays UCUM units (the `ucum_units` column, from `EXAMPLE_UCUM_UNITS`). UCUM is third-party content under the LOINC license (Section G of the third-party appendix) and has its own attribution requirements; the `/about` page carries the UCUM notice.

The full third-party attributions in machine-readable form live in [NOTICE](NOTICE) — keep it alongside `LICENSE` in any redistribution.

**LOINC data is not redistributed in this repository.** `docs/` is gitignored. To run this app you must download the LOINC distribution yourself from [loinc.org/downloads](https://loinc.org/downloads/) and accept the LOINC license there.

This app is provided "as is", without warranty. Don't rely on it as the sole source of clinical or laboratory information.
