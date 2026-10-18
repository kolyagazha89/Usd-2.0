#!/bin/sh
set -eu
mkdir -p /backups
while true; do
  target="/backups/usd-$(date -u +%Y%m%dT%H%M%SZ).dump"
  if pg_dump --format=custom --no-owner --file="$target.part" && pg_restore --list "$target.part" >/dev/null; then
    mv "$target.part" "$target"
    echo "Database backup created and archive checked at $(date -u +%FT%TZ)"
    find /backups -maxdepth 1 -type f -name 'usd-*.dump' -mtime +14 -delete
    sleep 86400
  else
    echo "Database backup FAILED; retry in one hour" >&2
    rm -f "$target.part"
    sleep 3600
  fi
done
