#!/usr/bin/env bash
set -euo pipefail
# Only a disposable CI-owned Compose project may be removed by this test.
tmp=$(mktemp -d)
project=usd-venue-b9016d32e1284f24a167002654bb512b
volume="${project}_venue_db"
cleanup() {
  docker compose --project-directory "$tmp" -p "$project" -f "$tmp/compose.yaml" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
cat > "$tmp/compose.yaml" <<'YAML'
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: usd_venue
      POSTGRES_USER: usd_venue_root
      POSTGRES_PASSWORD: ci-signed-stage-only
    volumes: [venue_db:/var/lib/postgresql]
    healthcheck:
      test: ["CMD-SHELL","pg_isready -U usd_venue_root -d usd_venue"]
      interval: 1s
      timeout: 2s
      retries: 40
volumes:
  venue_db:
YAML
compose=(docker compose --project-directory "$tmp" -p "$project" -f "$tmp/compose.yaml")
"${compose[@]}" up -d --no-deps --no-build --pull never db
for i in $(seq 1 45); do
  if "${compose[@]}" exec -T db pg_isready -U usd_venue_root -d usd_venue >/dev/null 2>&1; then break; fi
  sleep 1
done
"${compose[@]}" exec -T db psql -U usd_venue_root -d usd_venue -v ON_ERROR_STOP=1 -c "CREATE TABLE ci_stage_marker (id int PRIMARY KEY, stage_name text NOT NULL); INSERT INTO ci_stage_marker VALUES (1, 'original signed event');" >/dev/null
first=$("${compose[@]}" ps -a -q db)
test -n "$first"
python3 - "$volume" "$project" <<'PY'
import json, subprocess, sys
vol,project=sys.argv[1:]
labels=json.loads(subprocess.check_output(['docker','volume','inspect','--format','{{json .Labels}}',vol],text=True))
assert labels['com.docker.compose.project']==project
assert labels['com.docker.compose.volume']=='venue_db'
PY
# Docker Desktop (or an operator) can remove containers while retaining volumes.
"${compose[@]}" stop db
"${compose[@]}" rm -f db
test -z "$("${compose[@]}" ps -a -q db)"
test -n "$(docker volume ls --quiet --filter name="^$volume$")"
# These are the exact arguments of the Windows installer recovery branch.
"${compose[@]}" up -d --no-deps --no-build --no-recreate --pull never db
second=$("${compose[@]}" ps -a -q db)
test -n "$second" && test "$first" != "$second"
for i in $(seq 1 45); do
  if "${compose[@]}" exec -T db pg_isready -U usd_venue_root -d usd_venue >/dev/null 2>&1; then break; fi
  sleep 1
done
value=$("${compose[@]}" exec -T db psql -X -At -U usd_venue_root -d usd_venue -c 'SELECT stage_name FROM ci_stage_marker WHERE id=1')
test "$value" = 'original signed event'
# An already running database is never recreated by resume.
third=$("${compose[@]}" ps -a -q db)
test "$third" = "$second"
echo 'USD REAL DOCKER DB REATTACH PASS: container recreated, original PostgreSQL records retained, no unrelated volumes'
