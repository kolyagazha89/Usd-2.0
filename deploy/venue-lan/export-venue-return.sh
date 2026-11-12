#!/usr/bin/env bash
# Encrypted return bundle for USB transfer; read-only on venue and online.
# The local API never receives the Ed25519 private signing key at startup.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT"
if [[ $# -ne 2 || ! -t 0 ]]; then
 echo "Usage (interactive): bash export-venue-return.sh VENUE_PRIVATE_KEY.pem EXPORT_DIRECTORY" >&2
 exit 2
fi
PRIVATE="$(realpath -- "$1")"
DEST="$2"
if [[ ! -f "$PRIVATE" ]]; then echo "VENUE EXPORT BLOCKED: private signing key missing" >&2; exit 1; fi
mkdir -p -- "$DEST"
DEST="$(realpath -- "$DEST")"
chmod 0700 "$DEST"
python3 "$ROOT/preflight.py"
STAGE_ID="$(python3 - <<'PY'
from pathlib import Path
from preflight import load_env
print(load_env(Path('.env'))['VENUE_STAGE_ID'])
PY
)"
OUT="usd-venue-return-${STAGE_ID}-$(date -u +%Y%m%dT%H%M%SZ).json"
echo "USD USB export is PRIVATE: it contains encrypted participant data."
echo "Never copy the Ed25519 private key to the central server."
read -r -s -p "Strong encryption passphrase (16+ chars): " PASS
printf '\n'
read -r -s -p "Repeat encryption passphrase: " CHECK
printf '\n'
if [[ "$PASS" != "$CHECK" || ${#PASS} -lt 16 ]]; then
 unset PASS CHECK
 echo "VENUE EXPORT BLOCKED: encryption passphrase mismatch" >&2
 exit 1
fi
unset CHECK
COMPOSE=(docker compose -p usd-venue -f "$ROOT/compose.yaml")
printf '%s' "$PASS" | "${COMPOSE[@]}" run --rm --no-deps -T \
 --volume "$ROOT/import-stage.mjs:/app/import-stage.mjs:ro" \
 --volume "$ROOT/verify-stage-package.mjs:/app/verify-stage-package.mjs:ro" \
 --volume "$ROOT/venue-return-package.mjs:/app/venue-return-package.mjs:ro" \
 --volume "$ROOT/export-venue-return.mjs:/app/export-venue-return.mjs:ro" \
 --volume "$PRIVATE:/app/venue-return-signing-private.pem:ro" \
 --volume "$DEST:/app/venue-return-output:rw" \
 --entrypoint node api \
 /app/export-venue-return.mjs /app/venue-return-signing-private.pem \
 "/app/venue-return-output/$OUT"
unset PASS
echo "USD RETURN ENCRYPTED: $DEST/$OUT"
echo "Send the public key and its authenticated SHA256 fingerprint separately."
echo "The file is NOT a confirmation that central Ubuntu has synchronized data."
