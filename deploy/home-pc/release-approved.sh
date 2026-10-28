#!/usr/bin/env bash
# Explicitly approved USD image switch. No schema migrations, no database restart.
set -Eeuo pipefail
umask 077
exec 9>/run/lock/usd-home-deploy.lock
flock -n 9 || { echo "Another USD deploy is running"; exit 1; }

DEPLOY_DIR=/home/usd/usd-deploy/deploy/home-pc
STATE_DIR=/var/lib/usd-deployer
[[ "${1:-}" =~ ^[a-f0-9]{40}$ ]] || { echo "Usage: release-approved.sh <40-character-built-commit-sha>"; exit 2; }
NEW_TAG="$1"
[[ -f "$STATE_DIR/built-sha" ]] && [[ "$(cat "$STATE_DIR/built-sha")" == "$NEW_TAG" ]] || { echo "Commit not built by local builder"; exit 1; }
[[ -f /etc/usd-release-approved ]] || { echo "Explicit release approval file missing"; exit 1; }
for service in api frontend; do
  image="ghcr.io/kolyagazha89/usd-2.0-$service:$NEW_TAG"
  docker image inspect "$image" >/dev/null || { echo "Missing image: $image"; exit 1; }
done
cd "$DEPLOY_DIR"
[[ -r .env ]] || { echo "Missing .env"; exit 1; }
OLD_TAG="$(grep -E '^USD_IMAGE_TAG=[0-9a-f]{40}$' .env | head -n 1 | cut -d= -f2)"
[[ "$OLD_TAG" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid previous image tag"; exit 1; }
[[ "$OLD_TAG" != "$NEW_TAG" ]] || { echo "Already deployed"; exit 0; }

# Refuse automatic schema changes. Operator must separately verify migration compatibility.
[[ -f "$STATE_DIR/schema-approved-sha" ]] && [[ "$(cat "$STATE_DIR/schema-approved-sha")" == "$NEW_TAG" ]] || { echo "Schema compatibility not approved for this SHA"; exit 1; }

# Keep rollback copies protected; use the existing production compose overrides.
mkdir -p "$STATE_DIR"
cp -p .env "$STATE_DIR/previous.env"
printf '%s\n' "$OLD_TAG" > "$STATE_DIR/previous-sha"
rollback() {
  echo "Release failed, restoring prior API/frontend images"
  cp -p "$STATE_DIR/previous.env" .env
  docker compose --env-file .env -f compose.yaml -f compose.local.yaml up -d --no-deps api frontend || true
}
trap rollback ERR
sed -i -E "s/^USD_IMAGE_TAG=.*/USD_IMAGE_TAG=$NEW_TAG/" .env
docker compose --env-file .env -f compose.yaml -f compose.local.yaml config --quiet
docker compose --env-file .env -f compose.yaml -f compose.local.yaml up -d --no-deps api frontend

# HTTP 404 on API root is allowed; connection failures or 5xx are not.
ready=0
for attempt in $(seq 1 30); do
  frontend_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:18080/ || true)"
  api_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:13000/ || true)"
  if [[ "$frontend_code" =~ ^[23][0-9][0-9]$ ]] && [[ "$api_code" =~ ^[234][0-9][0-9]$ ]]; then
    ready=1
    break
  fi
  sleep 4
done
if [[ "$ready" -ne 1 ]]; then
  echo "Readiness failed: frontend=$frontend_code api=$api_code"
  false
fi
printf '%s\n' "$NEW_TAG" > "$STATE_DIR/deployed-sha"
rm -f "$STATE_DIR/previous.env" /etc/usd-release-approved
trap - ERR
echo "Release complete: $NEW_TAG"
