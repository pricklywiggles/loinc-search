# LOINC Search

Searchable web app for the [LOINC](https://loinc.org/) codebook. Type a name (`blood urea nitrogen`), a synonym (`GFR, Blood`), or a LOINC code (`98979-8`) and the app returns the matching record. Deprecated codes auto-redirect to their active replacement.

Built with Next.js 16 (App Router), TypeScript, TailwindCSS, and Neon Postgres (`pg_trgm` + `tsvector` for ranked full-text + trigram search). Source code is MIT-licensed; see [LICENSE](LICENSE). LOINC and UCUM data surfaced by the app remain under their own licenses; see [NOTICE](NOTICE).

---

## Quick start

```bash
pnpm install
psql "$DATABASE_URL_UNPOOLED" -f schema.sql        # create tables and indices
pnpm import-loinc --env dev docs                    # load CSVs (non-interactive)
pnpm dev                                            # http://localhost:3000
```

Requirements: pnpm 10+, Node 20+, `psql`, [`gum`](https://github.com/charmbracelet/gum) (only for interactive `pnpm import-loinc` runs — `brew install gum`), and a Neon Postgres branch with `pg_trgm` available (free tier works).

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

`pnpm import-loinc` wraps the importer in an interactive [gum](https://github.com/charmbracelet/gum) CLI. Two env files drive it:

| File | Loaded when you pick / pass | What it should contain |
| --- | --- | --- |
| `.env.local`            | `--env dev`  | Dev Neon branch credentials. |
| `.env.production.local` | `--env prod` | Production Neon branch credentials (gitignored, only present on the operator's machine). On Vercel: `pnpm dlx vercel env pull .env.production.local`. |

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

The recommended workflow for this project is an **in-place atomic refresh** against `main`:

1. **Capture prod credentials** into `.env.production.local` once. On Vercel: `pnpm dlx vercel env pull .env.production.local`.
2. **Run the import non-interactively** against prod:
    ```bash
    pnpm import-loinc --env prod /path/to/loinc-2.83
    ```
   Verify the `LOINC import → prod` banner and the `Target:` line before the `TRUNCATE` runs.
3. **Smoke-check the live site** afterwards — the import takes ~60 s, then `ANALYZE` runs and the new statistics are immediately live.

The `TRUNCATE`+`COPY`+`COMMIT` runs inside a single transaction: until `COMMIT` the old rows remain visible to readers, and any failure mid-import rolls back automatically. So in-place is safe even though it skips a verification window.

**Why not a branch-and-promote workflow?** A fully-loaded LOINC dataset is ~242 MB per branch (218 MB `loinc` heap + indexes, 15 MB `consumer_names`, etc.). Neon's Free plan caps storage at **500 MB *per project*** (across all branches combined — copy-on-write means a fresh branch starts at ~0, but a `TRUNCATE`+`COPY` fully diverges it). With dev + prod both fully populated you're already at ~484 MB, so spinning up a refresh branch tips the project over the cap. If you upgrade to Launch or trim the dev dataset, you can revisit the branch-and-promote pattern (create branch from `main` → import → verify → rename branch to `main`).

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
│   │   │   ├── search/route.ts      GET /api/search?q=… (zod-validated)
│   │   │   └── loinc/route.ts       GET /api/loinc?code=… (zod-validated)
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

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/search?q=…` | Returns up to 20 ranked `SearchResult` objects. If `q` matches `^\d{1,7}-\d$`, server-side falls through to lookup. Validates with `zod` (1–200 chars). |
| `GET /api/loinc?code=…` | Returns a `LookupResult` or 404. Validates `code` against the LOINC pattern. Joins `consumer_names`; populates `deprecated_alias` when the code is a `map_to` source. |

Both endpoints set `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

---

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the Next.js dev server at <http://localhost:3000>. |
| `pnpm build` | Production build. |
| `pnpm start` | Serve the production build. |
| `pnpm test` | Run the vitest suite against the Neon dev branch (reads `.env.local`). |
| `pnpm lint` | ESLint. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm import-loinc [--env dev\|prod] [folder]` | Refresh the database from a LOINC distribution folder. Interactive when args are missing; non-interactive when both `--env` and folder are supplied. |

---

## Tests

Two suites, both run against the Neon dev branch via `pnpm test`:

- **`src/lib/search.test.ts`** — `searchLoinc` and `lookupLoinc` against real data: `egfr` ranks kidney CKD-EPI 2021 codes above oncology EGFR mutations; `DEPRECATED`/`DISCOURAGED` rows are excluded from search; `TRIAL` rows score half; deprecated codes redirect to their target with `deprecated_alias.source_code` populated; unknown codes return `null`.
- **`src/app/api/routes.test.ts`** — API route handlers called directly with `Request` objects: input validation (400 on missing/invalid/too-long input), 404 on unknown codes, 200 with proper response shape and `Cache-Control` headers, search auto-routes to lookup when `q` matches the LOINC code pattern.

17 tests total.

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
