#!/usr/bin/env bash
# Controlled signed-stage transfer onto an ISOLATED laptop-only USD database.
# Default is read-only verification. Writes require both --apply and a
# second, interactive stage-ID confirmation. Never runs against Ubuntu.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT"

if [[ $# -lt 2 || $# -gt 3 || ( "${3:---dry-run}" != "--dry-run" && "${3:---dry-run}" != "--apply" ) ]]; then
  echo "Usage: ./bootstrap-local-stage.sh STAGE.json SIGNING_PUBLIC.pem [--dry-run|--apply]" >&2
  exit 2
fi
PACKAGE="$(realpath -- "$1")"
PUBLIC_KEY="$(realpath -- "$2")"
MODE="${3:---dry-run}"
if [[ ! -f "$PACKAGE" || ! -f "$PUBLIC_KEY" ]]; then
  echo "VENUE IMPORT BLOCKED: signed stage and public key must be readable regular files" >&2
  exit 1
fi
python3 "$ROOT/preflight.py"
# Verification reads no DB and cannot modify source, host or destination.
node "$ROOT/verify-stage-package.mjs" "$PACKAGE" "$PUBLIC_KEY"

STAGE_ID="$(python3 - <<'PY'
from pathlib import Path
from preflight import load_env
print(load_env(Path('.env'))['VENUE_STAGE_ID'])
PY
)"
COMPOSE=(docker compose -p usd-venue -f "$ROOT/compose.yaml")
IMPORT_MOUNTS=(
  --volume "$ROOT/import-stage.mjs:/app/import-stage.mjs:ro"
  --volume "$ROOT/verify-stage-package.mjs:/app/verify-stage-package.mjs:ro"
  --volume "$PACKAGE:/app/venue-stage.json:ro"
  --volume "$PUBLIC_KEY:/app/venue-signing-public.pem:ro"
)
# Explicit no-deps and entrypoint: no API, jobs or other services start.
"${COMPOSE[@]}" run --rm --no-deps "${IMPORT_MOUNTS[@]}" --entrypoint node api \
  /app/import-stage.mjs /app/venue-stage.json /app/venue-signing-public.pem --dry-run
if [[ "$MODE" == "--dry-run" ]]; then
  echo "VENUE DRY RUN COMPLETE: no PostgreSQL changes"
  exit 0
fi

echo "Single-stage import can only run into an EMPTY, separate usd-venue DB."
echo "It is not a full offsite event sync; review backups and all warnings first."
if [[ ! -t 0 ]]; then
  echo "VENUE IMPORT BLOCKED: --apply requires an interactive terminal" >&2
  exit 1
fi
read -r -p "To authorize local schema migration and import, type the stage UUID exactly: " CONFIRMED
if [[ "$CONFIRMED" != "$STAGE_ID" ]]; then
  echo "VENUE IMPORT BLOCKED: stage confirmation failed" >&2
  exit 1
fi
# These commands only reference ./compose.yaml with a fixed usd-venue project.
"${COMPOSE[@]}" up -d db
"${COMPOSE[@]}" run --rm --no-deps --entrypoint ./node_modules/.bin/prisma api \
  migrate deploy --config ./prisma7.config.ts
"${COMPOSE[@]}" run --rm --no-deps "${IMPORT_MOUNTS[@]}" --entrypoint node api \
  /app/import-stage.mjs /app/venue-stage.json /app/venue-signing-public.pem --apply "$STAGE_ID"
echo "USD VENUE: signed stage copied. Local staff roles, media and central sync remain separate requirements."
