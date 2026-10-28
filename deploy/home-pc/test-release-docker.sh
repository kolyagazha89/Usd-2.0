#!/usr/bin/env bash
# Real Docker rehearsal, exclusively on a disposable GitHub-hosted runner.
set -Eeuo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "$(id -u)" == 0 ]] ||
  { echo 'Run only as root on a disposable GitHub Actions runner' >&2; exit 1; }
[[ -z "$(docker ps -aq --filter label=com.docker.compose.project=usd-home)" ]] ||
  { echo 'Refusing to touch an existing usd-home stack' >&2; exit 1; }
ROOT=/home/usd/usd-deploy/deploy/home-pc
STATE=/var/lib/usd-deployer
TRUSTED_DIR=/etc/usd-deployer/compose
[[ ! -e "$TRUSTED_DIR" ]] || { echo "Trusted Compose directory already exists; refusing to overwrite it" >&2; exit 1; }
WORK="$(mktemp -d)"
OLD=1111111111111111111111111111111111111111
BAD=2222222222222222222222222222222222222222
GOOD=3333333333333333333333333333333333333333
volume="usd-release-ci-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
if docker volume inspect "$volume" >/dev/null 2>&1; then
  echo 'Refusing to reuse a pre-existing database volume' >&2
  exit 1
fi
cleanup() {
  local status=$?
  docker compose --env-file "$ROOT/.env" -f "$ROOT/compose.yaml" down --remove-orphans >/dev/null 2>&1 || true
  if [[ "$(docker volume inspect -f '{{ index .Labels "usd.qa.disposable" }}' "$volume" 2>/dev/null)" == true ]]; then
    docker volume rm "$volume" >/dev/null || true
  fi
  rm -rf "$TRUSTED_DIR" "$WORK"
  exit "$status"
}
trap cleanup EXIT
mkdir -p "$ROOT" "$STATE" "$WORK/api"
# All service images contain test fixtures only; no production source or secrets.
cat > "$WORK/api/server.js" <<'JS'
require('node:http').createServer((req,res)=>{res.statusCode=Number(process.env.QA_STATUS);res.end('disposable USD release rehearsal');}).listen(3000,'0.0.0.0');
JS
cat > "$WORK/api/Dockerfile" <<'DOCKER'
FROM node:24-alpine
ARG QA_STATUS=200
ENV QA_STATUS=$QA_STATUS
COPY server.js /server.js
CMD ["node","/server.js"]
DOCKER
docker build --build-arg QA_STATUS=200 -t "ghcr.io/kolyagazha89/usd-2.0-api:$OLD" "$WORK/api"
docker tag "ghcr.io/kolyagazha89/usd-2.0-api:$OLD" "ghcr.io/kolyagazha89/usd-2.0-api:$GOOD"
docker build --build-arg QA_STATUS=500 -t "ghcr.io/kolyagazha89/usd-2.0-api:$BAD" "$WORK/api"
docker pull nginx:alpine
for tag in "$OLD" "$BAD" "$GOOD"; do docker tag nginx:alpine "ghcr.io/kolyagazha89/usd-2.0-frontend:$tag"; done
docker volume create --label usd.qa.disposable=true "$volume" >/dev/null
cat > "$ROOT/.env" <<ENV
USD_IMAGE_TAG=$OLD
POSTGRES_DB=usd
POSTGRES_USER=usd
POSTGRES_PASSWORD=disposable-ci-only
QA_VOLUME=$volume
ENV
chmod 600 "$ROOT/.env"
cat > "$ROOT/compose.yaml" <<'YAML'
name: usd-home
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: [qa_data:/var/lib/postgresql]
    healthcheck:
      test: [CMD-SHELL, 'pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"']
      interval: 2s
      timeout: 2s
      retries: 30
  api:
    image: ghcr.io/kolyagazha89/usd-2.0-api:${USD_IMAGE_TAG}
  frontend:
    image: ghcr.io/kolyagazha89/usd-2.0-frontend:${USD_IMAGE_TAG}
volumes:
  qa_data:
    external: true
    name: ${QA_VOLUME}
YAML
mkdir -p "$TRUSTED_DIR"
cp "$ROOT/compose.yaml" "$TRUSTED_DIR/compose.yaml"
compose=(docker compose --env-file "$ROOT/.env" -f "$ROOT/compose.yaml")
"${compose[@]}" up -d --wait --wait-timeout 120
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U usd -d usd -c 'CREATE TABLE release_marker (id integer PRIMARY KEY); INSERT INTO release_marker VALUES (42);'
db_before="$("${compose[@]}" ps -q db)"
approve() {
  printf '%s\n' "$1" > "$STATE/built-sha"
  printf '%s\n' "$1" > "$STATE/schema-approved-sha"
  printf '%s\n' "$1" > "$STATE/release-approved-sha"
  chmod 600 "$STATE/"*-sha
}
approve "$BAD"
if bash deploy/home-pc/release-approved.sh "$BAD" > "$WORK/rollback.log" 2>&1; then
  echo 'Unhealthy API was incorrectly released' >&2
  exit 1
fi
grep -q 'Previous API/frontend passed readiness after rollback' "$WORK/rollback.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
"${compose[@]}" exec -T api node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status===200?0:1))"
approve "$GOOD"
bash deploy/home-pc/release-approved.sh "$GOOD"
[[ "$("${compose[@]}" ps -q db)" == "$db_before" ]]
[[ "$("${compose[@]}" exec -T db psql -At -U usd -d usd -c 'SELECT id FROM release_marker')" == 42 ]]
# Verify a real archive restores into a separate disposable database.
archives=(/home/usd/backups/release-"$GOOD".*.dump)
[[ "${#archives[@]}" == 1 && -s "${archives[0]}" ]]
"${compose[@]}" exec -T db createdb -U usd restore_check
"${compose[@]}" exec -T db pg_restore -U usd -d restore_check --no-owner --no-acl --exit-on-error --single-transaction < "${archives[0]}"
[[ "$("${compose[@]}" exec -T db psql -At -U usd -d restore_check -c 'SELECT id FROM release_marker')" == 42 ]]
echo 'Real PostgreSQL 18 backup/restore, Docker release, failed-readiness rollback and unchanged DB identity passed'
