#!/usr/bin/env bash
# Copy a private PostgreSQL archive to independent rclone storage, download the
# exact object again and compare every byte before a live release is allowed.
# This never connects to or modifies the running database.
set -Eeuo pipefail
umask 077
[[ $# == 2 ]] || { echo 'Usage: verify-db-offsite-backup.sh <private.dump> <remote:unique-object.dump>' >&2; exit 2; }
archive="$1"
destination="$2"
for tool in rclone cmp mktemp stat rm; do command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }; done
[[ -f "$archive" && ! -L "$archive" && -s "$archive" && "$(stat -c %u "$archive")" == 0 ]] ||
  { echo 'Database archive must be nonempty, regular and root-owned' >&2; exit 1; }
(( (8#$(stat -c %a "$archive") & 077) == 0 )) ||
  { echo 'Database archive must not be accessible to group or other users' >&2; exit 1; }
# Only a named rclone remote and a simple absolute-in-remote object path are
# accepted. Never permit local paths, traversal or remote aliases in policy.
python3 - "$destination" <<'PY'
import re
import sys
raw = sys.argv[1]
match = re.fullmatch(r'([A-Za-z0-9_][A-Za-z0-9_-]*):([A-Za-z0-9_/-]+\.dump)', raw)
if not match or any(segment in ('', '.', '..') for segment in match.group(2).split('/')):
    print('Invalid off-host database backup destination', file=sys.stderr)
    sys.exit(1)
PY
# The caller supplies a unique timestamped path. Refuse existing objects,
# including an already uploaded partial from an interrupted attempt.
if rclone lsjson --stat "$destination" >/dev/null 2>&1; then
  echo 'Off-host database backup object already exists; refusing overwrite' >&2
  exit 1
fi
restore="$(mktemp)"
cleanup() {
  local status=$?
  trap - EXIT
  if ! rm -f -- "$restore"; then
    echo "CRITICAL: downloaded database backup remains at $restore" >&2
    [[ "$status" != 0 ]] || status=1
  elif [[ "$status" == 0 ]]; then
    echo 'PASS: independent PostgreSQL archive copied off-host, downloaded, compared byte-for-byte and temporary copy removed.'
  fi
  exit "$status"
}
trap cleanup EXIT
rclone copyto --immutable "$archive" "$destination"
rclone copyto "$destination" "$restore"
cmp -s -- "$archive" "$restore" || { echo 'Off-host PostgreSQL archive differs from original' >&2; exit 1; }
