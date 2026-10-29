#!/usr/bin/env bash
# Operator-supervised full media copy, byte-for-byte verification and restore.
# rclone source and destination must be configured separately by the operator.
set -Eeuo pipefail
umask 077
[[ $# == 2 ]] || { echo 'Usage: verify-media-backup.sh <media-source> <new-off-host-backup-prefix>' >&2; exit 2; }
source="$1"
backup="$2"
for tool in rclone python3 mktemp df awk; do command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }; done
# A lexical prefix comparison is unsafe: local symlinks, relative paths and
# '../' aliases can make the destination equal to or inside the source. Rclone
# also accepts remote:path names. Canonicalize local paths and reject ambiguous
# remote traversal before any copy or temporary private restore is created.
python3 - "$source" "$backup" <<'PY'
import re
import sys
from pathlib import Path


def canonical(raw):
    if not raw or raw.startswith(':'):
        raise ValueError('empty or unsupported media path')
    match = re.fullmatch(r'([A-Za-z0-9_][A-Za-z0-9_-]*):(.*)', raw)
    if match:
        remote, path = match.groups()
        segments = [part for part in path.split('/') if part and part != '.']
        if '..' in segments:
            raise ValueError('remote media paths must not contain traversal')
        return ('remote', remote, '/' + '/'.join(segments))
    return ('local', '', str(Path(raw).expanduser().resolve(strict=False)))


try:
    src = canonical(sys.argv[1])
    dst = canonical(sys.argv[2])
    if src[:2] == dst[:2]:
        a, b = src[2].rstrip('/') or '/', dst[2].rstrip('/') or '/'
        if a == b or a.startswith(b.rstrip('/') + '/') or b.startswith(a.rstrip('/') + '/'):
            raise ValueError('source and backup must be distinct, non-nested paths')
except (OSError, ValueError) as exc:
    print(f'Unsafe media backup destination: {exc}', file=sys.stderr)
    sys.exit(1)
PY
# Require an empty backup prefix: never overwrite or mix snapshots.
# Filesystem-style remotes return an error for a missing directory. Create the
# validated new prefix first; mkdir is idempotent and never replaces objects.
rclone mkdir "$backup"
existing="$(rclone lsf --recursive --files-only "$backup")" || { echo 'Backup destination is not accessible' >&2; exit 1; }
[[ -z "$existing" ]] || { echo 'Backup destination is not empty; use a new snapshot prefix' >&2; exit 1; }
summary="$(rclone size --json "$source")"
read -r count bytes < <(python3 -c 'import json,sys; v=json.load(sys.stdin); print(v["count"],v["bytes"])' <<< "$summary")
[[ "$count" =~ ^[0-9]+$ && "$bytes" =~ ^[0-9]+$ && "$count" -gt 0 ]] || { echo 'Media source is empty or invalid' >&2; exit 1; }
# The restore target is a newly-created private local directory; it is never
# the original media directory or any production Docker volume.
restore="$(mktemp -d)"
cleanup() {
  local status=$?
  trap - EXIT
  # This directory contains a full restore of private participant media.
  # Never claim a verified backup while that sensitive copy remains on disk.
  if ! rm -rf -- "$restore"; then
    echo "CRITICAL: media restore cleanup failed; remove private data at $restore" >&2
    [[ "$status" != 0 ]] || status=1
  elif [[ "$status" == 0 ]]; then
    echo "PASS: backed up and restored $count media objects ($bytes bytes); verified full content both ways and removed temporary restore."
  fi
  exit "$status"
}
trap cleanup EXIT
available="$(df -PB1 "$restore" | awk 'NR==2 {print $4}')"
[[ "$available" =~ ^[0-9]+$ && "$available" -gt "$bytes" ]] || { echo 'Not enough free space for full restore verification' >&2; exit 1; }
rclone copy "$source" "$backup" --checkers 8 --transfers 4
rclone check "$source" "$backup" --download
rclone copy "$backup" "$restore" --checkers 8 --transfers 4
rclone check "$backup" "$restore" --download
read -r restored_count restored_bytes < <(rclone size --json "$restore" | python3 -c 'import json,sys; v=json.load(sys.stdin); print(v["count"],v["bytes"])')
[[ "$restored_count" == "$count" && "$restored_bytes" == "$bytes" ]] || { echo 'Restored media count or size differs from source' >&2; exit 1; }
# Report success only after private temporary media have been removed.
