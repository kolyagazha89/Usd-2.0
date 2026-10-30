#!/usr/bin/env bash
# Synthetic fixtures only; never creates or edits usd-home or host policy files.
set -Eeuo pipefail
umask 077
[[ "${USD_DAILY_BACKUP_DISPOSABLE_TEST:-}" == 1 && $# == 1 && "$1" == usd-daily-backup-ci:* ]] ||
  { echo 'Use USD_DAILY_BACKUP_DISPOSABLE_TEST=1 and an explicitly built usd-daily-backup-ci:<tag> image' >&2; exit 2; }
[[ -z "$(docker ps -aq --filter label=com.docker.compose.project=usd-home)" ]] ||
  { echo 'Refusing synthetic tests on a Docker daemon with a USD application stack' >&2; exit 1; }
image="$1"
docker image inspect "$image" >/dev/null
cd "$(dirname "$(realpath "$0")")"
work="$(mktemp -d)"
suffix="$(date +%s)-$$-$(openssl rand -hex 6)"
network="usd-daily-backup-test-$suffix"
db="$network-db"
network_created=0
db_created=0
cleanup() {
  local status=$? failed=0
  trap - EXIT
  if [[ "$db_created" == 1 ]] && ! docker rm -fv "$db" >/dev/null; then failed=1; fi
  if [[ "$network_created" == 1 ]] && ! docker network rm "$network" >/dev/null; then failed=1; fi
  rm -rf -- "$work" || failed=1
  [[ "$failed" == 0 ]] || status=1
  exit "$status"
}
trap cleanup EXIT
docker network create --internal "$network" >/dev/null
network_created=1
docker run -d --name "$db" --network "$network" \
  --memory=512m --memory-swap=512m \
  --mount type=tmpfs,destination=/var/lib/postgresql,tmpfs-size=268435456 \
  -e POSTGRES_USER=usd -e POSTGRES_PASSWORD=synthetic-ci-only -e POSTGRES_DB=usd \
  postgres:18-alpine >/dev/null
db_created=1
ready=0
for attempt in $(seq 1 60); do
  if docker exec "$db" pg_isready -h 127.0.0.1 -U usd -d usd >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]] || { echo 'Synthetic PostgreSQL 18 failed readiness' >&2; exit 1; }
url="postgresql://usd:synthetic-ci-only@$db:5432/usd?schema=public"
docker run --rm --network "$network" -e "DATABASE_URL=$url" --entrypoint npx "$image" prisma migrate deploy
docker exec "$db" psql -X -v ON_ERROR_STOP=1 -U usd -d usd -c \
  "CREATE TABLE daily_backup_fixture (id integer PRIMARY KEY, payload text NOT NULL); INSERT INTO daily_backup_fixture VALUES (42, 'synthetic backup content');"
docker exec "$db" pg_dump -Fc --no-owner --no-acl -U usd -d usd > "$work/database.dump"
bash rehearse-schema-on-backup.sh "$work/database.dump" "$image"
mkdir -p "$work/media/source/nested"
printf 'synthetic media one\n' > "$work/media/source/one.bin"
printf 'synthetic media two\n' > "$work/media/source/nested/two.bin"
bash verify-media-backup.sh "$work/media/source" "$work/media/backup"
if bash verify-media-backup.sh "$work/media/source" "$work/media/backup" > "$work/reuse.log" 2>&1; then
  echo 'Media verifier accepted a reused snapshot' >&2; exit 1
fi
grep -q 'Backup destination is not empty' "$work/reuse.log"
echo 'PASS: synthetic PostgreSQL 18 full restore/current Prisma history and media download/restore/reuse refusal'
