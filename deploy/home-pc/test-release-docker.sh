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
  rm -f -- "$RESTORE_VERIFIER"
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
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
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
