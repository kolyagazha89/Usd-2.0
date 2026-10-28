#!/usr/bin/env bash
# Manual, explicitly approved release of prebuilt images. No migrations or DB restart.
set -Eeuo pipefail
umask 077
exec 9>/run/lock/usd-home-deploy.lock
flock -n 9 || { echo "Another USD build/release is running" >&2; exit 1; }

DEPLOY_DIR=/home/usd/usd-deploy/deploy/home-pc
STATE_DIR=/var/lib/usd-deployer
PROJECT=usd-home
NEW_TAG="${1:-}"
[[ "$NEW_TAG" =~ ^[a-f0-9]{40}$ ]] || { echo "Usage: release-approved.sh <full Git SHA>" >&2; exit 2; }

# Approval files must be root-owned and contain the exact SHA, not just exist.
approved_sha() {
  local file="$1"
  [[ -f "$file" && ! -L "$file" && "$(stat -c %u "$file")" == 0 ]] &&
    (( (8#$(stat -c %a "$file") & 022) == 0 )) &&
    [[ "$(cat "$file")" == "$NEW_TAG" ]]
}
approval_file="$STATE_DIR/release-approved-sha"
if ! approved_sha "$approval_file"; then approval_file=/etc/usd-release-approved; fi
approved_sha "$approval_file" || { echo "Root-owned release approval for this SHA missing" >&2; exit 1; }
approved_sha "$STATE_DIR/schema-approved-sha" || { echo "Schema compatibility not approved for this SHA" >&2; exit 1; }
[[ -f "$STATE_DIR/built-sha" && "$(cat "$STATE_DIR/built-sha")" == "$NEW_TAG" ]] ||
  { echo "Requested SHA was not built locally" >&2; exit 1; }

cd "$DEPLOY_DIR"
[[ -f .env && ! -L .env ]] || { echo "Missing or symlinked production .env" >&2; exit 1; }
OLD_TAG="$(sed -n -E 's/^USD_IMAGE_TAG=([a-f0-9]{40})$/\1/p' .env)"
[[ "$OLD_TAG" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid or duplicated USD_IMAGE_TAG" >&2; exit 1; }
[[ "$OLD_TAG" != "$NEW_TAG" ]] || { echo "Already at requested SHA"; exit 0; }

for service in api frontend; do
  for tag in "$OLD_TAG" "$NEW_TAG"; do
    docker image inspect "ghcr.io/kolyagazha89/usd-2.0-$service:$tag" >/dev/null ||
      { echo "Image missing for $service:$tag (rollback must be possible)" >&2; exit 1; }
  done
done

# Use the *exact* Compose overlays used by the running API, including the tunnel
# overlay if present. Reject unfamiliar files rather than accidentally replacing
# a container with an incomplete or different configuration.
api_id="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=api")"
front_id="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=frontend")"
[[ -n "$api_id" && -n "$front_id" && "$api_id" != *$'\n'* && "$front_id" != *$'\n'* ]] ||
  { echo "Expected exactly one running API and frontend" >&2; exit 1; }
[[ "$(docker inspect -f '{{.Config.Image}}' "$api_id")" == "ghcr.io/kolyagazha89/usd-2.0-api:$OLD_TAG" &&
   "$(docker inspect -f '{{.Config.Image}}' "$front_id")" == "ghcr.io/kolyagazha89/usd-2.0-frontend:$OLD_TAG" ]] ||
  { echo "Running images do not match the deployment environment; refusing an unverified rollback target" >&2; exit 1; }
api_files="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$api_id")"
front_files="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$front_id")"
[[ -n "$api_files" && "$api_files" == "$front_files" ]] ||
  { echo "API and frontend use different Compose files" >&2; exit 1; }
IFS=',' read -r -a active_files <<< "$api_files"
compose_args=()
has_base=0
for file in "${active_files[@]}"; do
  case "$file" in
    "$DEPLOY_DIR/compose.yaml") has_base=1 ;;
    "$DEPLOY_DIR/compose.local.yaml"|"$DEPLOY_DIR/compose.tunnel.yaml") ;;
    *) echo "Unknown active Compose file: $file" >&2; exit 1 ;;
  esac
  [[ -f "$file" ]] || { echo "Compose file missing: $file" >&2; exit 1; }
  compose_args+=(-f "$file")
done
[[ "$has_base" == 1 ]] || { echo "Base Compose file absent" >&2; exit 1; }
db_before="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=db")"
[[ -n "$db_before" && "$db_before" != *$'\n'* ]] ||
  { echo "Expected exactly one running production DB" >&2; exit 1; }
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$db_before")" == healthy ]] ||
  { echo "Production DB is not healthy; refusing release" >&2; exit 1; }

# Use a private, unique rollback snapshot. Preserve original ownership and mode.
mkdir -p "$STATE_DIR"
backup="$(mktemp "$STATE_DIR/release-env.XXXXXXXX")"
cp -p .env "$backup"
changed=0
db_snapshot_tmp=''
wait_ready() {
  local attempt api_ok frontend_ok
  for attempt in $(seq 1 30); do
    api_ok=0
    frontend_ok=0
    docker compose --env-file .env "${compose_args[@]}" exec -T api node -e \
      "fetch('http://127.0.0.1:3000/',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1 && api_ok=1
    docker compose --env-file .env "${compose_args[@]}" exec -T frontend \
      wget -T 5 -q -O /dev/null http://127.0.0.1/index.html >/dev/null 2>&1 && frontend_ok=1
    if [[ "$api_ok" == 1 && "$frontend_ok" == 1 ]]; then return 0; fi
    sleep 4
  done
  return 1
}
rollback() {
  local status="${1:-$?}"
  trap - ERR TERM INT
  if [[ "$changed" == 1 ]]; then
    echo "Release failed (exit $status); restoring previous images" >&2
    cp -p "$backup" .env
    if ! docker compose --env-file .env "${compose_args[@]}" up -d --no-deps api frontend; then
      echo "CRITICAL: automatic image rollback failed; manual intervention required" >&2
    elif ! wait_ready; then
      echo "CRITICAL: previous API/frontend failed readiness after rollback; manual intervention required" >&2
    elif [[ "$(docker inspect -f '{{.State.Health.Status}}' "$db_before" 2>/dev/null)" != healthy ]]; then
      echo "CRITICAL: production DB is unhealthy after application rollback; manual intervention required" >&2
    else
      echo "Previous API/frontend passed readiness after rollback" >&2
    fi
  fi
  rm -f "$backup"
  [[ -z "$db_snapshot_tmp" ]] || rm -f "$db_snapshot_tmp"
  exit "$status"
}
trap rollback ERR
trap 'rollback 143' TERM
trap 'rollback 130' INT

# Keep a private custom-format database archive before replacing either service.
# This does not migrate, restore, restart or recreate PostgreSQL.
BACKUP_DIR=/home/usd/backups
[[ ! -L "$BACKUP_DIR" ]] || { echo "Refusing symlinked backup directory" >&2; false; }
install -d -m 0700 "$BACKUP_DIR"
db_snapshot_tmp="$(mktemp "$BACKUP_DIR/release-$NEW_TAG.XXXXXXXX.partial")"
docker compose --env-file .env "${compose_args[@]}" exec -T db sh -c \
  'pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$db_snapshot_tmp"
[[ -s "$db_snapshot_tmp" ]] || { echo "Database backup is empty" >&2; false; }
docker compose --env-file .env "${compose_args[@]}" exec -T db pg_restore --list < "$db_snapshot_tmp" >/dev/null
mv "$db_snapshot_tmp" "${db_snapshot_tmp%.partial}.dump"
db_snapshot_tmp=''

# Atomic replacement: never edit .env in place and never source it as shell.
tmp="$(mktemp "$DEPLOY_DIR/.env.release.XXXXXXXX")"
cp -p .env "$tmp"
sed -i -E "s/^USD_IMAGE_TAG=[a-f0-9]{40}$/USD_IMAGE_TAG=$NEW_TAG/" "$tmp"
docker compose --env-file "$tmp" "${compose_args[@]}" config --quiet
changed=1
mv -f "$tmp" .env
docker compose --env-file .env "${compose_args[@]}" up -d --no-deps api frontend

# In-container checks work even when no localhost ports are published.
# Both services must return HTTP 200; checking 404 on the API is not sufficient.
wait_ready || { echo "New API/frontend failed readiness checks" >&2; false; }
db_after="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=db")"
[[ "$db_before" == "$db_after" ]] || { echo "Database container changed unexpectedly" >&2; false; }
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$db_after")" == healthy ]] ||
  { echo "Production DB became unhealthy during release" >&2; false; }

printf '%s\n' "$NEW_TAG" > "$STATE_DIR/deployed-sha"
rm -f "$backup" "$approval_file"
trap - ERR TERM INT
echo "USD release successful: $OLD_TAG -> $NEW_TAG"
