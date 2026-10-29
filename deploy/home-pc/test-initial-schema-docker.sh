#!/usr/bin/env bash
# Real Prisma/PG18 test of the first-run helper on fixture-only data.
set -Eeuo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted && "$(id -u)" == 0 ]] ||
  { echo 'Only run on a disposable GitHub-hosted CI worker' >&2; exit 1; }
SHA="${1:-}"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || exit 2
SOURCE=/opt/usd-release-source
STATE=/var/lib/usd-deployer
for protected in "$SOURCE" "$STATE"; do
  [[ ! -e "$protected" && ! -L "$protected" ]] || { echo "Existing fixture path: $protected" >&2; exit 1; }
done
[[ -z "$(docker ps -aq --filter label=com.docker.compose.project=usd-home)" ]] || exit 1
NEW="ghcr.io/kolyagazha89/usd-2.0-api:$SHA"
OLD=ghcr.io/kolyagazha89/usd-2.0-api:e8b5b0f22780a61e79765b8fd92167e241df82a2
if docker image inspect "$OLD" >/dev/null 2>&1 || docker image inspect "$NEW" >/dev/null 2>&1; then
  echo 'Refusing to overwrite pre-existing SHA image tags' >&2
  exit 1
fi
prefix="usd-initial-ci-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
db="$prefix-db"
api="$prefix-api"
network="$prefix-net"
WORK="$(mktemp -d)"
cleanup() {
  local result=$?
  docker rm -fv "$api" "$db" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$NEW" "$OLD" >/dev/null 2>&1 || true
  rm -rf -- "$SOURCE" "$STATE" "$WORK"
  exit "$result"
}
trap cleanup EXIT
cp -R --no-preserve=ownership "$PWD" "$SOURCE"
install -d -o root -g root -m 0700 "$STATE"
docker tag "usd-api-candidate:$SHA" "$NEW"
# The baseline-tagged fixture only holds the live network namespace; migration
# compatibility is checked against the real previous schema/history below.
docker tag "usd-api-candidate:$SHA" "$OLD"
docker network create --internal "$network" >/dev/null
docker run -d --name "$db" --network "$network" --network-alias db \
  --label com.docker.compose.project=usd-home --label com.docker.compose.service=db \
  --memory=512m -e POSTGRES_USER=usd -e POSTGRES_DB=usd -e POSTGRES_PASSWORD=disposable-ci-only \
  postgres:18-alpine >/dev/null
ready=0
for _ in $(seq 1 60); do
  if docker exec "$db" pg_isready -h 127.0.0.1 -U usd -d usd >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]]
url='postgresql://usd:disposable-ci-only@db:5432/usd?schema=public'
docker run --rm --network "$network" -e "DATABASE_URL=$url" --entrypoint npx "$NEW" prisma migrate deploy
# Reconstruct ONLY this isolated fixture's baseline by removing the two new
# nullable additions and their two history records. Never do this on a host.
docker exec "$db" psql -X -v ON_ERROR_STOP=1 -U usd -d usd -c '
  ALTER TABLE "Participant" DROP COLUMN "usdIdToken";
  ALTER TABLE "CarHeadUnit" DROP COLUMN "catalogEntryId";
  ALTER TABLE "CarAudioComponent" DROP COLUMN "catalogEntryId";
  ALTER TABLE "CarAmplifier" DROP COLUMN "catalogEntryId";
  DELETE FROM "_prisma_migrations" WHERE migration_name IN
    ('"'"'20261028150000_participant_usd_id'"'"','"'"'20261028172000_configuration_catalog_entry_ids'"'"');
  CREATE TABLE initial_upgrade_marker (id integer PRIMARY KEY);
  INSERT INTO initial_upgrade_marker VALUES (42);'
docker run -d --name "$api" --network "$network" \
  --label com.docker.compose.project=usd-home --label com.docker.compose.service=api \
  -e "DATABASE_URL=$url" --entrypoint node "$OLD" -e 'setInterval(()=>{},1000)' >/dev/null
db_id="$(docker inspect -f '{{.Id}}' "$db")"
exec 9>/run/lock/usd-home-deploy.lock
flock -n 9
export USD_DEPLOY_LOCK_HELD=1
python3 deploy/home-pc/initial-schema.py --check "$SHA"
if python3 deploy/home-pc/initial-schema.py --apply "$SHA" > "$WORK/missing-receipt.log" 2>&1; then
  echo 'Migration accepted without a backup/restore receipt' >&2
  exit 1
fi
[[ "$(docker exec "$db" psql -At -U usd -d usd -c 'SELECT id FROM initial_upgrade_marker')" == 42 ]]
# Production receipts are emitted only by the real release backup/restore
# preflight. This fixture tests their exact SHA/baseline/DB binding.
printf '%s\n%s\n%s\n' "$SHA" e8b5b0f22780a61e79765b8fd92167e241df82a2 wrong-db > "$STATE/initial-preflight"
chmod 600 "$STATE/initial-preflight"
if python3 deploy/home-pc/initial-schema.py --apply "$SHA" > "$WORK/wrong-db-receipt.log" 2>&1; then
  echo 'Migration accepted a receipt for a different DB' >&2
  exit 1
fi
printf '%s\n%s\n%s\n' "$SHA" e8b5b0f22780a61e79765b8fd92167e241df82a2 "${db_id:0:12}" > "$STATE/initial-preflight"
python3 deploy/home-pc/initial-schema.py --apply "$SHA"
python3 deploy/home-pc/initial-schema.py --check "$SHA"
python3 deploy/home-pc/initial-schema.py --apply "$SHA"
[[ ! -e "$STATE/initial-preflight" ]]
[[ "$(docker inspect -f '{{.Id}}' "$db")" == "$db_id" ]]
[[ "$(docker exec "$db" psql -At -U usd -d usd -c 'SELECT id FROM initial_upgrade_marker')" == 42 ]]
[[ "$(docker exec "$db" psql -At -U usd -d usd -c 'SELECT count(*) FROM information_schema.columns WHERE table_name IN ('"'"'CarHeadUnit'"'"','"'"'CarAudioComponent'"'"','"'"'CarAmplifier'"'"') AND column_name='"'"'catalogEntryId'"'"'')" == 3 ]]
echo 'Real PostgreSQL/Prisma initial nullable upgrade, receipt refusals and idempotency passed'
