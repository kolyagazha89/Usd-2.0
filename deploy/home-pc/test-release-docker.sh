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
RESTORE_VERIFIER=/usr/local/libexec/usd-rehearse-schema-on-backup
DB_OFFSITE_VERIFIER=/usr/local/libexec/usd-verify-db-offsite-backup
DB_OFFSITE_POLICY=/etc/usd-deployer/db-backup.conf
MEDIA_POLICY=/etc/usd-deployer/media-backup.conf
MEDIA_VERIFIER=/usr/local/libexec/usd-verify-media-backup
[[ ! -e "$DB_OFFSITE_VERIFIER" && ! -L "$DB_OFFSITE_VERIFIER" && ! -e "$DB_OFFSITE_POLICY" && ! -L "$DB_OFFSITE_POLICY" ]] ||
  { echo 'Existing off-host PostgreSQL policy/helper; refusing Docker fixture' >&2; exit 1; }
[[ ! -e "$MEDIA_POLICY" && ! -L "$MEDIA_POLICY" && ! -e "$MEDIA_VERIFIER" && ! -L "$MEDIA_VERIFIER" ]] ||
  { echo "Existing media policy/helper; refusing Docker fixture" >&2; exit 1; }
[[ ! -e "$RESTORE_VERIFIER" && ! -L "$RESTORE_VERIFIER" ]] ||
  { echo "Existing PostgreSQL restore verifier; refusing to overwrite it in disposable Docker rehearsal" >&2; exit 1; }
[[ ! -e "$TRUSTED_DIR" ]] || { echo "Trusted Compose directory already exists; refusing to overwrite it" >&2; exit 1; }
# This rehearsal deliberately creates fixture credentials and state at fixed
# paths. Never overwrite an existing installation even if CI environment
# variables were accidentally present on a non-disposable machine.
for protected in "$ROOT/.env" "$ROOT/compose.yaml" "$STATE/built-sha" "$STATE/deployed-sha" "$STATE/schema-approved-sha" "$STATE/release-approved-sha"; do
  [[ ! -e "$protected" && ! -L "$protected" ]] ||
    { echo "Existing deployment state at $protected; refusing disposable rehearsal" >&2; exit 1; }
done
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
  rm -f -- "$RESTORE_VERIFIER" "$DB_OFFSITE_VERIFIER" "$DB_OFFSITE_POLICY" "$MEDIA_VERIFIER" "$MEDIA_POLICY"
  rm -rf "$TRUSTED_DIR" "$WORK"
  exit "$status"
}
trap cleanup EXIT
# Preserve failure evidence before the disposable stack and volume are removed.
# Without this, an initdb/readiness race looks like an unexplained psql failure.
diagnose_failure() {
  local code="$1" line="$2"
  echo "Real Docker release rehearsal failed at line $line (exit $code)" >&2
  docker compose --env-file "$ROOT/.env" -f "$ROOT/compose.yaml" ps -a >&2 || true
  docker compose --env-file "$ROOT/.env" -f "$ROOT/compose.yaml" logs --tail=100 db api frontend >&2 || true
  for file in "$WORK"/*.log; do
    [[ -f "$file" ]] || continue
    echo "--- $(basename "$file") ---" >&2
    tail -n 60 "$file" >&2
  done
}
trap 'diagnose_failure "$?" "$LINENO"' ERR
mkdir -p "$ROOT" "$STATE" "$WORK/api" /usr/local/libexec
# CI fixture API images intentionally lack Prisma. This harness restores the
# release archive into a separate disposable database and checks real rows;
# the production Prisma-enabled isolated-volume helper is exercised separately
# against the actual API Dockerfile by Home PC safety checks.
cat > "$RESTORE_VERIFIER" <<'RESTORE'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$#" == 2 && -s "$1" && "$2" == ghcr.io/kolyagazha89/usd-2.0-api:* ]] || exit 1
root=/home/usd/usd-deploy/deploy/home-pc
compose=(docker compose --env-file "$root/.env" -f "$root/compose.yaml")
name="release_rehearsal_${BASHPID}"
"${compose[@]}" exec -T db createdb -U usd "$name"
cleanup() { "${compose[@]}" exec -T db dropdb -U usd --if-exists "$name"; }
trap cleanup EXIT
"${compose[@]}" exec -T db pg_restore -U usd -d "$name" --no-owner --no-acl --exit-on-error --single-transaction < "$1"
[[ "$("${compose[@]}" exec -T db psql -At -U usd -d "$name" -c 'SELECT id FROM release_marker')" == 42 ]]
RESTORE
chmod 0700 "$RESTORE_VERIFIER"
mkdir -p /etc/usd-deployer
printf 'usd-db-offsite:verified\n' > "$DB_OFFSITE_POLICY"
chmod 600 "$DB_OFFSITE_POLICY"
# Exercise the REAL path validator and byte-for-byte transport helper against
# a disposable rclone alias. A wildcard mock missed malformed backup names.
command -v rclone >/dev/null
mkdir -p "$WORK/offsite"
export RCLONE_CONFIG="$WORK/rclone.conf"
printf '[usd-db-offsite]\ntype = alias\nremote = %s/offsite\n' "$WORK" > "$RCLONE_CONFIG"
chmod 600 "$RCLONE_CONFIG"
install -o root -g root -m 0700 deploy/home-pc/verify-db-offsite-backup.sh "$DB_OFFSITE_VERIFIER"
printf 'usd-media:ci-source\nusd-media-offsite:verified\n' > "$MEDIA_POLICY"
chmod 600 "$MEDIA_POLICY"
cat > "$MEDIA_VERIFIER" <<'MEDIA'
#!/usr/bin/env bash
set -euo pipefail
[[ "$#" == 2 && "$1" == usd-media:ci-source && "$2" == usd-media-offsite:verified/* ]] || exit 1
[[ "${USD_TEST_FAIL_MEDIA:-0}" != 1 ]] || exit 1
MEDIA
chmod 0700 "$MEDIA_VERIFIER"
# All service images contain test fixtures only; no production source or secrets.
cat > "$WORK/api/server.js" <<'JS'
require('node:http').createServer((req,res)=>{res.statusCode=Number(process.env.QA_STATUS);res.end('disposable USD release rehearsal');}).listen(3000,'0.0.0.0');
JS
cat > "$WORK/api/Dockerfile" <<'DOCKER'
FROM node:24-alpine
WORKDIR /app
# Match production readiness: the disposable API must have the pg client
# so the helper can prove its actual PostgreSQL credentials work.
RUN npm install --no-audit --no-fund --no-save pg@8.16.3
ARG QA_STATUS=200
ENV QA_STATUS=$QA_STATUS
COPY server.js /app/server.js
CMD ["node","/app/server.js"]
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
DATABASE_URL=postgresql://usd:disposable-ci-only@db:5432/usd?schema=public
APP_DOMAIN=app.usd-russia.ru
API_DOMAIN=api.usd-russia.ru
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
      # Require TCP: the official image's temporary init server accepts sockets only.
      test: [CMD-SHELL, 'pg_isready -h 127.0.0.1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"']
      interval: 2s
      timeout: 2s
      retries: 30
  api:
    image: ghcr.io/kolyagazha89/usd-2.0-api:${USD_IMAGE_TAG}
    environment:
      DATABASE_URL: ${DATABASE_URL}
      NODE_ENV: production
      AUTH_COOKIE_SECURE: "true"
      FRONTEND_URL: https://${APP_DOMAIN}
      CORS_ORIGINS: https://${APP_DOMAIN}
      CSRF_TRUSTED_ORIGINS: https://${APP_DOMAIN}
      API_PUBLIC_URL: https://${API_DOMAIN}
      PUBLIC_API_URL: https://${API_DOMAIN}
    depends_on:
      db:
        condition: service_healthy
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
api_before="$("${compose[@]}" ps -q api)"
approve() {
  printf '%s\n' "$1" > "$STATE/built-sha"
  printf '%s\n' "$1" > "$STATE/schema-approved-sha"
  printf '%s\n' "$1" > "$STATE/release-approved-sha"
  chmod 600 "$STATE/"*-sha
}
approve "$BAD"
# Manual release must refuse a failed media restore BEFORE touching DB or images.
if USD_TEST_FAIL_MEDIA=1 bash deploy/home-pc/release-approved.sh "$BAD" > "$WORK/media-refusal.log" 2>&1; then
  echo 'Manual release accepted a failed media backup' >&2
  exit 1
fi
grep -q 'Independent media backup/full restore failed' "$WORK/media-refusal.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
# Even with db:5432 in the URL authority, a query parameter may override
# the connection target. Reject it before Docker or PostgreSQL backup access.
sed -i 's|?schema=public$|?schema=public\&host=remote-db|' "$ROOT/.env"
if bash deploy/home-pc/release-approved.sh "$BAD" > "$WORK/unsafe-db-query.log" 2>&1; then
  echo 'Release accepted query-overridden PostgreSQL connection target' >&2
  exit 1
fi
grep -q 'unsafe PostgreSQL connection query parameters' "$WORK/unsafe-db-query.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
sed -i 's|?schema=public&host=remote-db$|?schema=public|' "$ROOT/.env"
# A valid on-disk local DB URL is not proof of the actual running DB target.
# Change BOTH .env credentials without recreating containers: the old live
# PostgreSQL/API still use the original password. Refuse before pg_dump.
sed -i -e 's/^POSTGRES_PASSWORD=disposable-ci-only$/POSTGRES_PASSWORD=stale-config-only/' \
       -e 's/\(DATABASE_URL=postgresql:\/\/usd:\)disposable-ci-only@/\1stale-config-only@/' "$ROOT/.env"
if bash deploy/home-pc/release-approved.sh "$BAD" > "$WORK/runtime-db-drift.log" 2>&1; then
  echo 'Release accepted a stale live PostgreSQL configuration' >&2
  exit 1
fi
grep -q 'Running API/DB configuration does not match approved prerelease backup target' "$WORK/runtime-db-drift.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
sed -i -e 's/^POSTGRES_PASSWORD=stale-config-only$/POSTGRES_PASSWORD=disposable-ci-only/' \
       -e 's/\(DATABASE_URL=postgresql:\/\/usd:\)stale-config-only@/\1disposable-ci-only@/' "$ROOT/.env"
# A healthy PostgreSQL container and HTTP-200 API are insufficient when the
# API loses its DB network route. Refuse before backup or replacing images.
docker network disconnect usd-home_default "$api_before"
if bash deploy/home-pc/release-approved.sh "$BAD" > "$WORK/no-db-connectivity.log" 2>&1; then
  echo 'Release accepted an API without PostgreSQL connectivity' >&2
  exit 1
fi
grep -q 'Existing API/frontend failed pre-release readiness' "$WORK/no-db-connectivity.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
[[ "$("${compose[@]}" ps -q db)" == "$db_before" ]]
docker network connect --alias api usd-home_default "$api_before"
# With connectivity restored, the candidate's HTTP-500 must now reach the
# normal post-switch rollback path (not fail the baseline readiness preflight).
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
archives=(/var/lib/usd-deployer/backups/release-"$GOOD".*.dump)
[[ "${#archives[@]}" == 1 && -s "${archives[0]}" ]]
[[ "$(stat -c %u /var/lib/usd-deployer/backups)" == 0 ]] ||
  { echo "Release backup directory is not root-owned" >&2; exit 1; }
[[ "$(stat -c %a /var/lib/usd-deployer/backups)" == 700 ]] ||
  { echo "Release backup directory is not private" >&2; exit 1; }
[[ "$(stat -c %u "${archives[0]}")" == 0 && "$(stat -c %a "${archives[0]}")" == 600 ]] ||
  { echo "Release database archive is not root-only" >&2; exit 1; }
"${compose[@]}" exec -T db createdb -U usd restore_check
"${compose[@]}" exec -T db pg_restore -U usd -d restore_check --no-owner --no-acl --exit-on-error --single-transaction < "${archives[0]}"
[[ "$("${compose[@]}" exec -T db psql -At -U usd -d restore_check -c 'SELECT id FROM release_marker')" == 42 ]]
echo 'Real PostgreSQL 18 backup/restore, Docker release, failed-readiness rollback and unchanged DB identity passed'
