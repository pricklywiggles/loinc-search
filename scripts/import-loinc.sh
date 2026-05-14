#!/usr/bin/env bash
#
# Interactive wrapper for scripts/import-loinc.ts. Uses gum (charmbracelet)
# for prompts and styling. Fully non-interactive when both --env and a folder
# are supplied; otherwise prompts for whatever is missing.
#
# Usage:
#   pnpm import-loinc                              # interactive: pick env, pick folder
#   pnpm import-loinc --env dev docs               # non-interactive
#   pnpm import-loinc --env prod /tmp/loinc-2.83   # non-interactive
#
set -euo pipefail

DEV_FILE=".env.local"
PROD_FILE=".env.production.local"

usage() {
  cat <<'EOF'
Usage: pnpm import-loinc [--env dev|prod] [folder]

Refreshes the LOINC tables in Postgres from a distribution folder.

Flags:
  --env dev|prod    Use credentials from .env.local (dev) or
                    .env.production.local (prod). If omitted and both files
                    have DATABASE_URL_UNPOOLED, you'll be prompted to pick.
  -h, --help        Show this help.

Positional:
  folder            Path to a LOINC distribution root. Defaults to ./docs
                    when running non-interactively; otherwise prompted.

Examples:
  pnpm import-loinc                              # pick env + folder
  pnpm import-loinc --env dev                    # pick folder, dev creds
  pnpm import-loinc --env prod /tmp/loinc-2.83   # fully non-interactive
EOF
}

# ---- arg parsing --------------------------------------------------------
ENV_ARG=""
FOLDER_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV_ARG="${2-}"
      shift 2 || { echo "--env requires a value (dev|prod)" >&2; exit 1; }
      ;;
    --env=*)
      ENV_ARG="${1#--env=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown flag: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -z "$FOLDER_ARG" ]]; then
        FOLDER_ARG="$1"
      else
        echo "Unexpected argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -n "$ENV_ARG" && "$ENV_ARG" != "dev" && "$ENV_ARG" != "prod" ]]; then
  echo "--env must be 'dev' or 'prod' (got: $ENV_ARG)" >&2
  exit 1
fi

# Gum is only required for interactive parts. If both --env and folder are
# supplied, we never prompt and don't need gum at all (useful for CI).
need_interactive=false
[[ -z "$ENV_ARG" || -z "$FOLDER_ARG" ]] && need_interactive=true

if $need_interactive && ! command -v gum >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Error: interactive mode needs `gum` (https://github.com/charmbracelet/gum).
  brew install gum

Or call the script non-interactively by passing both --env and the folder:
  pnpm import-loinc --env dev docs
EOF
  exit 1
fi

# ---- detect available env files ----------------------------------------
has_var() {
  # has_var <file> <varname>
  [[ -f "$1" ]] && grep -Eq "^${2}=" "$1"
}

dev_available=false
prod_available=false
has_var "$DEV_FILE"  DATABASE_URL_UNPOOLED && dev_available=true
has_var "$PROD_FILE" DATABASE_URL_UNPOOLED && prod_available=true

if [[ "$dev_available" == "false" && "$prod_available" == "false" ]]; then
  if command -v gum >/dev/null 2>&1; then
    gum style --foreground 196 --bold "No DATABASE_URL_UNPOOLED found."
  else
    echo "No DATABASE_URL_UNPOOLED found." >&2
  fi
  echo "Looked in:" >&2
  echo "  - $DEV_FILE   (dev)" >&2
  echo "  - $PROD_FILE  (prod)" >&2
  exit 1
fi

# ---- resolve env -------------------------------------------------------
if [[ -n "$ENV_ARG" ]]; then
  if [[ "$ENV_ARG" == "dev"  && "$dev_available"  == "false" ]]; then
    echo "--env dev requested but $DEV_FILE has no DATABASE_URL_UNPOOLED" >&2
    exit 1
  fi
  if [[ "$ENV_ARG" == "prod" && "$prod_available" == "false" ]]; then
    echo "--env prod requested but $PROD_FILE has no DATABASE_URL_UNPOOLED" >&2
    exit 1
  fi
else
  # Need to pick. If only one is available, use it; otherwise gum choose.
  available_count=0
  $dev_available  && available_count=$((available_count + 1))
  $prod_available && available_count=$((available_count + 1))

  if [[ "$available_count" -eq 1 ]]; then
    if $dev_available; then ENV_ARG="dev"; else ENV_ARG="prod"; fi
    gum style --faint "Only one credential set found; using '$ENV_ARG'."
  else
    gum style --bold --foreground 212 "Which database to refresh?"
    options=()
    $dev_available  && options+=("dev   ($DEV_FILE)")
    $prod_available && options+=("prod  ($PROD_FILE)")
    selection=$(gum choose --header "" "${options[@]}")
    [[ "$selection" == dev* ]] && ENV_ARG="dev" || ENV_ARG="prod"
  fi
fi

if [[ "$ENV_ARG" == "dev" ]]; then ENV_FILE="$DEV_FILE"; else ENV_FILE="$PROD_FILE"; fi

# ---- resolve folder ----------------------------------------------------
if [[ -z "$FOLDER_ARG" ]]; then
  FOLDER_ARG=$(gum input \
    --header "Path to LOINC distribution folder" \
    --placeholder "press Enter for ./docs" \
    --value "")
  [[ -z "$FOLDER_ARG" ]] && FOLDER_ARG="docs"
fi

# ---- confirm + run -----------------------------------------------------
# Banner. Prod gets a louder color and a confirm step.
banner_color=212  # pink
[[ "$ENV_ARG" == "prod" ]] && banner_color=196  # red

if command -v gum >/dev/null 2>&1; then
  gum style --border rounded --padding "0 1" --foreground "$banner_color" --bold \
    "LOINC import → $ENV_ARG"
  printf "  Env file: %s\n  Folder:   %s\n\n" "$ENV_FILE" "$FOLDER_ARG"
else
  printf "=== LOINC import → %s ===\n  Env file: %s\n  Folder:   %s\n\n" \
    "$ENV_ARG" "$ENV_FILE" "$FOLDER_ARG"
fi

# Extra safety: confirm before refreshing prod, unless explicitly skipped.
if [[ "$ENV_ARG" == "prod" && "$need_interactive" == "true" ]]; then
  if ! gum confirm --default=false "This will TRUNCATE production. Proceed?"; then
    echo "Aborted."
    exit 1
  fi
fi

# Source the env file so DATABASE_URL_UNPOOLED is exported to the child.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

exec pnpm exec tsx scripts/import-loinc.ts "$FOLDER_ARG"
