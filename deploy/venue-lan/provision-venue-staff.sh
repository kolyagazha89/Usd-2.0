#!/usr/bin/env bash
# Interactive on-site staff enrollment; no credentials on CLI, argv or .env.
# Run AFTER the signed one-stage import. Never invoke on production Ubuntu.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT"
if [[ $# -ne 2 || ( "$1" != "admin" && "$1" != "judge" )
  || ! "$2" =~ ^[a-z][a-z0-9-]{5,23}$ ]]; then
 echo "Usage: bash provision-venue-staff.sh admin|judge LOCAL_LOGIN" >&2
 exit 2
fi
if [[ ! -t 0 ]]; then
 echo "VENUE STAFF BLOCKED: password enrollment requires interactive local terminal" >&2
 exit 1
fi
python3 "$ROOT/preflight.py"
KIND="$1"
HANDLE="$2"
echo "Creating a LOCAL ONLY USD ${KIND} login: ${HANDLE}@venue.invalid"
echo "This account does not exist on the public Ubuntu server."
read -r -s -p "New unique offline password (16+ chars, letters/caps/numbers/symbol): " SECRET
printf '\n'
read -r -s -p "Repeat offline password: " CONFIRM
printf '\n'
if [[ "$SECRET" != "$CONFIRM" || ${#SECRET} -lt 16 ]]; then
 unset SECRET CONFIRM
 echo "VENUE STAFF BLOCKED: password confirmation mismatch or password too short" >&2
 exit 1
fi
unset CONFIRM
COMPOSE=(docker compose -p usd-venue -f "$ROOT/compose.yaml")
# The production API image runs as uid=node; mounted scripts are read-only.
# Password is supplied on stdin, not as an argument or env variable, and is
# never logged by the Node CLI. No email provider or network needed.
printf '%s' "$SECRET" | "${COMPOSE[@]}" run --rm --no-deps -T \
  --volume "$ROOT/provision-staff.mjs:/app/provision-staff.mjs:ro" \
  --volume "$ROOT/import-stage.mjs:/app/import-stage.mjs:ro" \
  --volume "$ROOT/verify-stage-package.mjs:/app/verify-stage-package.mjs:ro" \
  --entrypoint node api /app/provision-staff.mjs "$KIND" "$HANDLE"
unset SECRET
echo "USD venue: use this LOCAL login on the offline LAN HTTPS screen."
