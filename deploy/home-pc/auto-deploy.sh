#!/usr/bin/env bash
# USD local pull/build/deploy. Run ONLY as a root-owned systemd service.
set -Eeuo pipefail
umask 077
exec 9>/run/lock/usd-home-deploy.lock
flock -n 9 || exit 0

SOURCE_DIR=/opt/usd-release-source
DEPLOY_DIR=/home/usd/usd-deploy/deploy/home-pc
STATE_DIR=/var/lib/usd-deployer
REPO=https://github.com/kolyagazha89/Usd-2.0.git
mkdir -p "$STATE_DIR"
# Explicit operator gate: no production changes until migration and backup review.
[[ -f /etc/usd-deploy-enabled ]] || { echo "Deployment not enabled; exiting safely"; exit 0; }

if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  git clone --no-checkout --filter=blob:none "$REPO" "$SOURCE_DIR"
fi
git -C "$SOURCE_DIR" fetch --no-tags --depth=1 origin main
SHA="$(git -C "$SOURCE_DIR" rev-parse FETCH_HEAD)"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 1
if [[ -f "$STATE_DIR/deployed-sha" && "$(cat "$STATE_DIR/deployed-sha")" == "$SHA" ]]; then
  exit 0
fi
git -C "$SOURCE_DIR" checkout --force --detach "$SHA"
# Do not run schema migrations automatically. Deploy only when the DB schema is compatible.

[[ -r "$DEPLOY_DIR/.env" ]] || { echo "Missing deploy env"; exit 1; }
cd "$DEPLOY_DIR"
# Parse only the non-secret image tag; never execute .env as shell code.
OLD_TAG="$(sed -nE 's/^USD_IMAGE_TAG=([0-9a-f]{40})$/\1/p' .env | head -n 1)"
[[ "$OLD_TAG" =~ ^[0-9a-f]{40}$ ]] || { echo "Existing USD_IMAGE_TAG must be full SHA"; exit 1; }

# Build sequentially to reduce peak RAM. Database is never rebuilt or restarted.
docker build -t "ghcr.io/kolyagazha89/usd-2.0-api:$SHA" "$SOURCE_DIR/backend"
docker build --build-arg VITE_API_URL=https://api.usd-russia.ru -t "ghcr.io/kolyagazha89/usd-2.0-frontend:$SHA" "$SOURCE_DIR/frontend"

# Save previous tag before attempting the update.
printf '%s\n' "$OLD_TAG" > "$STATE_DIR/previous-sha"
cp -p .env "$STATE_DIR/previous.env"
sed -i -E "s/^USD_IMAGE_TAG=.*/USD_IMAGE_TAG=$SHA/" .env


rollback() {
  echo "Deploy failed; restoring previous images"
  cp -p "$STATE_DIR/previous.env" .env

  docker compose --env-file .env -f compose.yaml -f compose.local.yaml up -d --no-deps api frontend || true
}
trap rollback ERR

docker compose --env-file .env -f compose.yaml -f compose.local.yaml config --quiet
docker compose --env-file .env -f compose.yaml -f compose.local.yaml up -d --no-deps api frontend
# Readiness checks against existing localhost bindings.
for i in $(seq 1 24); do
  if curl -fsS --max-time 3 -o /dev/null http://127.0.0.1:18080/ && curl -sS --max-time 3 -o /dev/null http://127.0.0.1:13000/; then
    printf '%s\n' "$SHA" > "$STATE_DIR/deployed-sha"
    rm -f "$STATE_DIR/previous.env"
    trap - ERR
    echo "Deployed $SHA"
    exit 0
  fi
  sleep 5
done
echo "Readiness check failed"
false
