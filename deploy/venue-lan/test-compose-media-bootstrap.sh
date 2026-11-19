#!/usr/bin/env bash
set -euo pipefail
# Execute actual Compose verbs against disposable CI-only resources.
tmp=$(mktemp -d)
project=usd-venue-b9016d32e1284f24a167002654bb512a
volume=${project}_venue_media
cleanup() {
  docker compose --project-directory "$tmp" -p "$project" -f "$tmp/compose.yaml" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
cat > "$tmp/compose.yaml" <<'YAML'
services:
  rustfs:
    image: postgres:18-alpine
    command: ["sleep", "infinity"]
    volumes: [venue_media:/data]
volumes:
  venue_media:
YAML
compose=(docker compose --project-directory "$tmp" -p "$project" -f "$tmp/compose.yaml")
"${compose[@]}" create --no-recreate rustfs
first=$("${compose[@]}" ps -aq rustfs)
test -n "$first"
python3 - "$volume" "$project" <<'PY'
import json,subprocess,sys
volume,project=sys.argv[1:]
labels=json.loads(subprocess.check_output(['docker','volume','inspect','--format','{{json .Labels}}',volume],text=True))
assert labels['com.docker.compose.project']==project, labels
assert labels['com.docker.compose.volume']=='venue_media', labels
PY
fix='set -eu; test $(stat -c %u:%g /data) = 10001:10001 || chown 10001:10001 /data; test $(stat -c %u:%g /data) = 10001:10001'
docker run --rm --network none --user 0:0 --mount "type=volume,source=${volume},target=/data" --entrypoint sh postgres:18-alpine -ec "$fix"
docker run --rm --network none --user 10001:10001 --mount "type=volume,source=${volume},target=/data" --entrypoint sh postgres:18-alpine -ec 'touch /data/.venue-test-write && rm /data/.venue-test-write'
"${compose[@]}" create --no-recreate rustfs
second=$("${compose[@]}" ps -aq rustfs)
test "$first" = "$second"
docker run --rm --network none --user 0:0 --mount "type=volume,source=${volume},target=/data" --entrypoint sh postgres:18-alpine -ec "$fix"
echo 'USD REAL DOCKER COMPOSE CREATE + RUSTFS VOLUME BOOT + REPLAY PASS'
