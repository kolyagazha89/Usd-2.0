#!/usr/bin/env bash
# Rehearse candidate Prisma migrations on a disposable PostgreSQL 18 restore.
# Never connects to the production database or exposes a network port.
set -Eeuo pipefail
umask 077

usage() { echo 'Usage: rehearse-schema-on-backup.sh <private-pg18.dump> <locally-built-api-image>' >&2; exit 2; }
[[ $# == 2 ]] || usage
archive="$1"
image="$2"
[[ -f "$archive" && ! -L "$archive" && -s "$archive" ]] || { echo 'Backup must be a nonempty regular file (not a symlink)' >&2; exit 1; }
[[ "$image" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$ ]] || { echo 'Invalid candidate image reference' >&2; exit 1; }
for tool in docker openssl date du df awk sort; do command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }; done
docker image inspect "$image" >/dev/null || { echo 'Candidate API image not found locally' >&2; exit 1; }
available_mb="$(awk '/MemAvailable:/ {print int($2/1024)}' /proc/meminfo)"
[[ "$available_mb" =~ ^[0-9]+$ && "$available_mb" -ge 1536 ]] ||
  { echo 'Insufficient memory for isolated PostgreSQL/Prisma restore rehearsal' >&2; exit 1; }
# A compressed pg_dump can expand several-fold during restore. Fail closed
# before creating Docker resources if the Docker data filesystem is too full.
docker_root="$(docker info --format '{{.DockerRootDir}}')"
[[ -d "$docker_root" ]] || { echo 'Cannot inspect Docker storage' >&2; exit 1; }
archive_kb="$(du -k "$archive" | awk '{print $1}')"
free_kb="$(df -Pk "$docker_root" | awk 'NR==2 {print $4}')"
[[ "$archive_kb" =~ ^[0-9]+$ && "$free_kb" =~ ^[0-9]+$ ]] ||
  { echo 'Cannot measure disposable restore capacity' >&2; exit 1; }
(( free_kb > archive_kb * 6 + 2097152 )) ||
  { echo 'Insufficient Docker storage for isolated PostgreSQL restore rehearsal' >&2; exit 1; }

# An internal Docker network prevents a candidate image from reaching
# production PostgreSQL, S3, mail services or the public internet.
network="usd-migration-rehearsal-$(date +%s)-$$"
db="${network}-db"
volume="${network}-data"
password="$(openssl rand -hex 24)"
url="postgresql://usd:${password}@${db}:5432/usd?schema=public"
network_created=0
volume_created=0
container_created=0
cleanup() {
  local status=$? cleanup_failed=0
  trap - EXIT
  # The disposable volume contains a FULL copy of production personal data.
  # A cleanup failure must never be reported as a successful rehearsal.
  if [[ "$container_created" == 1 ]] && ! docker rm -f "$db" >/dev/null 2>&1; then
    echo "CRITICAL: disposable PostgreSQL container remains: $db" >&2
    cleanup_failed=1
  fi
  if [[ "$volume_created" == 1 ]] && ! docker volume rm "$volume" >/dev/null 2>&1; then
    echo "CRITICAL: restored production data may remain in Docker volume: $volume" >&2
    cleanup_failed=1
  fi
  if [[ "$network_created" == 1 ]] && ! docker network rm "$network" >/dev/null 2>&1; then
    echo "CRITICAL: disposable migration network remains: $network" >&2
    cleanup_failed=1
  fi
  if [[ "$cleanup_failed" == 1 ]]; then
    echo 'Migration rehearsal cleanup failed; remove isolated resources securely before approving any release' >&2
    [[ "$status" != 0 ]] || status=1
  elif [[ "$status" == 0 ]]; then
    echo 'PASS: PostgreSQL 18 archive restored; Prisma migrations applied; existing row counts preserved; disposable database and volume securely removed.'
  fi
  exit "$status"
}
trap cleanup EXIT
# Refuse to reuse even an apparently disposable resource.
if docker volume inspect "$volume" >/dev/null 2>&1 || docker network inspect "$network" >/dev/null 2>&1; then
  echo 'Disposable resource name already exists; refusing to reuse it' >&2
  exit 1
fi
docker network create --internal "$network" >/dev/null
network_created=1
docker volume create --label usd.migration.disposable=true "$volume" >/dev/null
volume_created=1
docker run -d --name "$db" --network "$network" --network-alias "$db" \
  --memory=512m --memory-swap=512m \
  --mount "type=volume,source=$volume,target=/var/lib/postgresql" \
  -e POSTGRES_USER=usd -e POSTGRES_DB=usd -e "POSTGRES_PASSWORD=$password" \
  --label usd.migration.disposable=true postgres:18-alpine >/dev/null
container_created=1
ready=0
for _ in $(seq 1 60); do
  if docker exec "$db" pg_isready -h 127.0.0.1 -U usd -d usd >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]] || { echo 'Disposable PostgreSQL 18 failed readiness' >&2; exit 1; }
# --list alone cannot prove that the database objects and rows are restorable.
docker exec -i "$db" pg_restore --exit-on-error --no-owner --no-acl -U usd -d usd < "$archive"
docker exec "$db" psql -X -v ON_ERROR_STOP=1 -U usd -d usd -tAc 'SELECT 1' | grep -qx 1
# Capture exact row counts for every pre-existing application table. A
# migration which silently drops a table or loses rows must not be approved
# merely because Prisma reports a clean schema. New tables are allowed; a
# deliberate data-moving migration requires separate manual review.
count_query="$(docker exec "$db" psql -X -v ON_ERROR_STOP=1 -U usd -d usd -tAc \
  "SELECT string_agg(format('SELECT %L AS table_name, count(*) AS row_count FROM %I.%I', tablename, schemaname, tablename), ' UNION ALL ') FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'")"
[[ -n "$count_query" ]] || { echo 'Restored archive contains no application tables' >&2; exit 1; }
rows_before="$(docker exec "$db" psql -X -v ON_ERROR_STOP=1 -U usd -d usd -tAc "$count_query" | LC_ALL=C sort)"
[[ -n "$rows_before" ]] || { echo 'Cannot count rows in restored archive' >&2; exit 1; }
# Candidate image gets only an ephemeral DATABASE_URL; no production env file.
docker run --rm --memory=512m --memory-swap=512m --network "$network" -e "DATABASE_URL=$url" --entrypoint npx "$image" prisma migrate deploy
docker run --rm --memory=512m --memory-swap=512m --network "$network" -e "DATABASE_URL=$url" --entrypoint npx "$image" prisma migrate status
rows_after="$(docker exec "$db" psql -X -v ON_ERROR_STOP=1 -U usd -d usd -tAc "$count_query" | LC_ALL=C sort)"
[[ "$rows_after" == "$rows_before" ]] || {
  echo 'Migration rehearsal changed row counts or removed a pre-existing table; manual data migration review required' >&2
  exit 1
}
docker exec "$db" psql -X -v ON_ERROR_STOP=1 -U usd -d usd -tAc 'SELECT 1' | grep -qx 1
# Success is reported by the EXIT trap only after all disposable resources are removed.
