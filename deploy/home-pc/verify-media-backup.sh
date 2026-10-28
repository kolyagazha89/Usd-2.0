#!/usr/bin/env bash
# Operator-supervised full media copy, byte-for-byte verification and restore.
# rclone source and destination must be configured separately by the operator.
set -Eeuo pipefail
umask 077
[[ $# == 2 ]] || { echo 'Usage: verify-media-backup.sh <media-source> <new-off-host-backup-prefix>' >&2; exit 2; }
source="$1"
backup="$2"
src_norm="${source%/}"
backup_norm="${backup%/}"
[[ -n "$src_norm" && -n "$backup_norm" && "$src_norm" != "$backup_norm" && "$backup_norm" != "$src_norm/"* ]] ||
  { echo 'Source and backup must be distinct, non-nested paths' >&2; exit 1; }
for tool in rclone python3 mktemp df awk; do command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }; done
# Require an empty backup prefix: never overwrite or mix snapshots.
existing="$(rclone lsf --recursive --files-only "$backup")" || { echo 'Backup destination is not accessible' >&2; exit 1; }
[[ -z "$existing" ]] || { echo 'Backup destination is not empty; use a new snapshot prefix' >&2; exit 1; }
summary="$(rclone size --json "$source")"
read -r count bytes < <(python3 -c 'import json,sys; v=json.load(sys.stdin); print(v["count"],v["bytes"])' <<< "$summary")
[[ "$count" =~ ^[0-9]+$ && "$bytes" =~ ^[0-9]+$ && "$count" -gt 0 ]] || { echo 'Media source is empty or invalid' >&2; exit 1; }
# The restore target is a newly-created private local directory; it is never
# the original media directory or any production Docker volume.
restore="$(mktemp -d)"
trap 'rm -rf -- "$restore"' EXIT
available="$(df -PB1 "$restore" | awk 'NR==2 {print $4}')"
[[ "$available" =~ ^[0-9]+$ && "$available" -gt "$bytes" ]] || { echo 'Not enough free space for full restore verification' >&2; exit 1; }
rclone copy "$source" "$backup" --checkers 8 --transfers 4
rclone check "$source" "$backup" --download
rclone copy "$backup" "$restore" --checkers 8 --transfers 4
rclone check "$backup" "$restore" --download
read -r restored_count restored_bytes < <(rclone size --json "$restore" | python3 -c 'import json,sys; v=json.load(sys.stdin); print(v["count"],v["bytes"])')
[[ "$restored_count" == "$count" && "$restored_bytes" == "$bytes" ]] || { echo 'Restored media count or size differs from source' >&2; exit 1; }
echo "PASS: backed up and restored $count media objects ($bytes bytes); verified full content both ways."
