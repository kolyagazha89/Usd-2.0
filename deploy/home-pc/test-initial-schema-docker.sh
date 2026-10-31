#!/usr/bin/env bash
# Real Prisma/PG18 test of the first-run helper on fixture-only data.
set -Eeuo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted && "$(id -u)" == 0 ]] ||
  { echo 'Only run on a disposable GitHub-hosted CI worker' >&2; exit 1; }
# Hosted runners may inherit a group-writable umask. The production helper
# correctly refuses such source paths; keep this root-only fixture private.
umask 077
SHA="${1:-}"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || exit 2
SOURCE=/opt/usd-release-source
STATE=/var/lib/usd-deployer
for protected in "$SOURCE" "$STATE"; do
  [[ ! -e "$protected" && ! -L "$protected" ]] || { echo "Existing fixture path: $protected" >&2; exit 1; }
done
[[ -z "$(docker ps -aq --filter label=com.docker.compose.project=usd-home)" ]] || exit 1
REVIEWED_COMMIT=09d936fb3945222d1955ff9ea73490c9b82d04b0
REVIEWED_TREE=4d9fa43dafd01e58354c3d22ead2cafe45152044
REVIEWED_TEAM_TREE=a22c242dd0c6dfa9554f179cf705b39499a68967
BASELINE=e8b5b0f22780a61e79765b8fd92167e241df82a2
IMAGE=ghcr.io/kolyagazha89/usd-2.0-api
NEW="$IMAGE:$SHA"
OLD="$IMAGE:$BASELINE"
if docker image inspect "$OLD" >/dev/null 2>&1 || docker image inspect "$NEW" >/dev/null 2>&1; then
  echo 'Refusing to overwrite pre-existing SHA image tags' >&2
  exit 1
fi
prefix="usd-initial-ci-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
db="$prefix-db"
api="$prefix-api"
network="$prefix-net"
WORK="$(mktemp -d)"
fixture_images=("$NEW" "$OLD")
cleanup() {
  local result=$?
  docker rm -fv "$api" "$db" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "${fixture_images[@]}" >/dev/null 2>&1 || true
  rm -rf -- "$SOURCE" "$STATE" "$WORK"
  exit "$result"
}
trap cleanup EXIT
phase='prepare isolated source'
# Report only a fixed operation name and line number, never BASH_COMMAND/env.
trap 'printf "Initial schema fixture failed during %s at line %s\n" "$phase" "$LINENO" >&2' ERR
# Use an independent fixture repository: a worktree .git file must never point
# fixture commits/checkouts back into the candidate's real repository.
install -d -o root -g root -m 0700 "$SOURCE"
git init -q "$SOURCE"
git -C "$SOURCE" fetch -q --no-tags --depth=1 "$PWD" "$SHA"
git -C "$SOURCE" checkout -q --detach "$SHA"
helper_digest="$(sha256sum deploy/home-pc/initial-schema.py | cut -d ' ' -f 1)"
check_source() {
  [[ "$(git -C "$SOURCE" rev-parse HEAD)" == "$1" ]]
  [[ "$(sha256sum "$SOURCE/deploy/home-pc/initial-schema.py" | cut -d ' ' -f 1)" == "$helper_digest" ]]
}
check_source "$SHA"
if ! git -C "$SOURCE" cat-file -e "$REVIEWED_TREE^{tree}" 2>/dev/null; then
  reviewed_remote="$PWD"
  if ! git cat-file -e "$REVIEWED_COMMIT^{commit}" 2>/dev/null; then
    reviewed_remote="$(git remote get-url origin)"
  fi
  git -C "$SOURCE" fetch -q --no-tags --depth=1 "$reviewed_remote" "$REVIEWED_COMMIT"
  [[ "$(git -C "$SOURCE" rev-parse "$REVIEWED_COMMIT:backend/prisma")" == "$REVIEWED_TREE" ]]
fi
# Only the fixture repository and image receive this historical snapshot.
rm -rf -- "$SOURCE/backend/prisma"
install -d "$SOURCE/backend/prisma"
git -C "$SOURCE" archive "$REVIEWED_TREE" | tar -x -C "$SOURCE/backend/prisma"
git -C "$SOURCE" add backend/prisma
git -C "$SOURCE" -c user.name='USD CI fixture' -c user.email='fixture@invalid' \
  commit -q --allow-empty -m 'Fixture only: reviewed initial nullable upgrade schema'
REVIEWED_SHA="$(git -C "$SOURCE" rev-parse HEAD)"
[[ "$(git -C "$SOURCE" rev-parse HEAD:backend/prisma)" == "$REVIEWED_TREE" ]]
check_source "$REVIEWED_SHA"
cat > "$WORK/Dockerfile" <<'DOCKERFILE'
ARG CANDIDATE_IMAGE
FROM ${CANDIDATE_IMAGE}
ARG FIXTURE_SHA
RUN --mount=type=bind,source=prisma,target=/fixture-prisma,readonly \
    rm -rf /app/prisma && cp -a /fixture-prisma /app/prisma
LABEL org.opencontainers.image.revision=${FIXTURE_SHA}
DOCKERFILE
build_schema_fixture() {
  local fixture_sha="$1" fixture_image="$IMAGE:$1"
  if docker image inspect "$fixture_image" >/dev/null 2>&1; then
    echo 'Refusing to overwrite a pre-existing fixture SHA image tag' >&2
    exit 1
  fi
  fixture_images+=("$fixture_image")
  rm -rf -- "$WORK/prisma"
  cp -R "$SOURCE/backend/prisma" "$WORK/prisma"
  phase='build schema fixture image'
  docker build --build-arg "CANDIDATE_IMAGE=usd-api-candidate:$SHA" \
    --build-arg "FIXTURE_SHA=$fixture_sha" -t "$fixture_image" "$WORK"
  [[ "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$fixture_image")" == "$fixture_sha" ]]
}
build_schema_fixture "$REVIEWED_SHA"
REVIEWED="$IMAGE:$REVIEWED_SHA"
phase='prepare legacy image and database'
install -d -o root -g root -m 0700 "$STATE"
docker tag "usd-api-candidate:$SHA" "$NEW"
[[ "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$NEW")" == "$SHA" ]]
# This container only holds the baseline network namespace. Label its fixture
# image consistently with the baseline tag; its schema comes from REVIEWED.
printf 'FROM %s\nLABEL org.opencontainers.image.revision=%s\n' "$REVIEWED" "$BASELINE" > "$WORK/Dockerfile.baseline"
docker build -f "$WORK/Dockerfile.baseline" -t "$OLD" "$WORK"
[[ "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$OLD")" == "$BASELINE" ]]
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
docker run --rm --network "$network" -e "DATABASE_URL=$url" --entrypoint npx "$REVIEWED" prisma migrate deploy
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
# Exercise rejection for either approved candidate tree; the now-approved team
# schema MUST be modified into an unreviewed fixture before negative admission.
phase='prepare unreviewed schema refusal'
git -C "$SOURCE" checkout -q --detach "$SHA"
REJECTED_SHA="$SHA"
if [[ "$(git -C "$SOURCE" rev-parse HEAD:backend/prisma)" == "$REVIEWED_TREE" ||
      "$(git -C "$SOURCE" rev-parse HEAD:backend/prisma)" == "$REVIEWED_TEAM_TREE" ]]; then
  printf '\n// Fixture only: unreviewed schema change.\n' >> "$SOURCE/backend/prisma/schema.prisma"
  git -C "$SOURCE" add backend/prisma/schema.prisma
  git -C "$SOURCE" -c user.name='USD CI fixture' -c user.email='fixture@invalid' \
    commit -q -m 'Fixture only: unreviewed candidate schema'
  REJECTED_SHA="$(git -C "$SOURCE" rev-parse HEAD)"
  build_schema_fixture "$REJECTED_SHA"
fi
phase='verify unreviewed source and image'
check_source "$REJECTED_SHA"
[[ "$(git -C "$SOURCE" rev-parse HEAD:backend/prisma)" != "$REVIEWED_TREE" ]]
api_identity="$(docker inspect -f '{{.Id}} {{.Image}} {{.Config.Image}}' "$api")"
db_identity="$(docker inspect -f '{{.Id}} {{.Image}} {{.Config.Image}}' "$db")"
database_digest() {
  docker exec "$db" pg_dump -U usd -d usd --restrict-key=usdinitialcifixture | sha256sum
}
before_rejection="$(database_digest)"
printf '%s\n%s\n%s\n' "$REJECTED_SHA" "$BASELINE" "${db_id:0:12}" > "$STATE/initial-preflight"
chmod 600 "$STATE/initial-preflight"
for mode in --check --apply; do
  phase="reject unreviewed schema ($mode)"
  stat -c 'Fixture source trust: uid=%u gid=%g mode=%a' "$SOURCE"
  if python3 deploy/home-pc/initial-schema.py "$mode" "$REJECTED_SHA" > "$WORK/unreviewed-$mode.log" 2>&1; then
    echo "Unreviewed candidate schema accepted by $mode" >&2
    exit 1
  fi
  if ! grep -Fq 'Candidate Prisma tree is not an explicitly reviewed additive upgrade' "$WORK/unreviewed-$mode.log"; then
    printf 'Unexpected helper refusal reason for %s during %s at line %s:\n' "$mode" "$phase" "$LINENO" >&2
    # This helper deliberately emits sanitized errors, never command output or
    # environment values. Keep diagnostics bounded to its first eight lines.
    head -n 8 "$WORK/unreviewed-$mode.log" >&2
    exit 1
  fi
  phase="preserve database after unreviewed refusal ($mode)"
  after_rejection="$(database_digest)"
  if [[ "$after_rejection" != "$before_rejection" ]]; then
    printf 'Database dump digest changed during %s at line %s: expected %s; actual %s\n' "$phase" "$LINENO" "$before_rejection" "$after_rejection" >&2
    exit 1
  fi
  phase="preserve container/image/receipt identities ($mode)"
  [[ "$(docker inspect -f '{{.Id}} {{.Image}} {{.Config.Image}}' "$api")" == "$api_identity" ]]
  [[ "$(docker inspect -f '{{.Id}} {{.Image}} {{.Config.Image}}' "$db")" == "$db_identity" ]]
  [[ "$(cat "$STATE/initial-preflight")" == "$(printf '%s\n%s\n%s' "$REJECTED_SHA" "$BASELINE" "${db_id:0:12}")" ]]
done
[[ "$(docker exec "$db" psql -At -U usd -d usd -c 'SELECT id FROM initial_upgrade_marker')" == 42 ]]
echo "Unreviewed schema refused by check/apply with DB, marker, receipt and image identities preserved: $REJECTED_SHA"
rm -- "$STATE/initial-preflight"
phase='accept reviewed nullable upgrade and verify receipts/idempotency'
git -C "$SOURCE" checkout -q --detach "$REVIEWED_SHA"
check_source "$REVIEWED_SHA"
python3 deploy/home-pc/initial-schema.py --check "$REVIEWED_SHA"
if python3 deploy/home-pc/initial-schema.py --apply "$REVIEWED_SHA" > "$WORK/missing-receipt.log" 2>&1; then
  echo 'Migration accepted without a backup/restore receipt' >&2
  exit 1
fi
[[ "$(docker exec "$db" psql -At -U usd -d usd -c 'SELECT id FROM initial_upgrade_marker')" == 42 ]]
# Production receipts are emitted only by the real release backup/restore
# preflight. This fixture tests their exact SHA/baseline/DB binding.
printf '%s\n%s\n%s\n' "$REVIEWED_SHA" "$BASELINE" wrong-db > "$STATE/initial-preflight"
chmod 600 "$STATE/initial-preflight"
if python3 deploy/home-pc/initial-schema.py --apply "$REVIEWED_SHA" > "$WORK/wrong-db-receipt.log" 2>&1; then
  echo 'Migration accepted a receipt for a different DB' >&2
  exit 1
fi
printf '%s\n%s\n%s\n' "$REVIEWED_SHA" "$BASELINE" "${db_id:0:12}" > "$STATE/initial-preflight"
python3 deploy/home-pc/initial-schema.py --apply "$REVIEWED_SHA"
python3 deploy/home-pc/initial-schema.py --check "$REVIEWED_SHA"
python3 deploy/home-pc/initial-schema.py --apply "$REVIEWED_SHA"
[[ ! -e "$STATE/initial-preflight" ]]
[[ "$(docker inspect -f '{{.Id}}' "$db")" == "$db_id" ]]
[[ "$(docker inspect -f '{{.Id}} {{.Image}} {{.Config.Image}}' "$api")" == "$api_identity" ]]
[[ "$(docker inspect -f '{{.Id}} {{.Image}} {{.Config.Image}}' "$db")" == "$db_identity" ]]
[[ "$(docker exec "$db" psql -At -U usd -d usd -c 'SELECT id FROM initial_upgrade_marker')" == 42 ]]
[[ "$(docker exec "$db" psql -At -U usd -d usd -c 'SELECT count(*) FROM information_schema.columns WHERE table_name IN ('"'"'CarHeadUnit'"'"','"'"'CarAudioComponent'"'"','"'"'CarAmplifier'"'"') AND column_name='"'"'catalogEntryId'"'"'')" == 3 ]]
echo 'Real PostgreSQL/Prisma reviewed nullable upgrade, unreviewed schema refusals, receipt refusals and idempotency passed'
