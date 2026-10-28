#!/usr/bin/env bash
# USD staged local builder. Does not modify production containers or database.
set -Eeuo pipefail
umask 077
exec 9>/run/lock/usd-home-deploy.lock
flock -n 9 || exit 0

SOURCE_DIR=/opt/usd-release-source
STATE_DIR=/var/lib/usd-deployer
REPO=https://github.com/kolyagazha89/Usd-2.0.git
mkdir -p "$STATE_DIR"

# A deliberate root-owned switch is required before any build.
if [[ ! -f /etc/usd-deploy-enabled || -L /etc/usd-deploy-enabled || "$(stat -c %u /etc/usd-deploy-enabled 2>/dev/null)" != 0 ]]; then
  echo "USD deploy disabled; no changes made"
  exit 0
fi

available_mb="$(awk '/MemAvailable:/ {print int($2/1024)}' /proc/meminfo)"
free_kb="$(df -Pk /var/lib/docker | awk 'NR==2 {print $4}')"
if (( available_mb < 3072 || free_kb < 8388608 )); then
  echo "Insufficient available memory or disk for safe local Docker build" >&2
  exit 1
fi

if [[ -L "$SOURCE_DIR" ]]; then
  echo "Refusing symlinked build source" >&2
  exit 1
fi
if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  git clone --no-checkout --filter=blob:none "$REPO" "$SOURCE_DIR"
fi
[[ "$(stat -c %u "$SOURCE_DIR")" == 0 ]] || { echo "Build source must be root-owned" >&2; exit 1; }
[[ "$(git -C "$SOURCE_DIR" remote get-url origin)" == "$REPO" ]] || { echo "Unexpected Git remote" >&2; exit 1; }
git -C "$SOURCE_DIR" fetch --no-tags --depth=1 origin main
SHA="$(git -C "$SOURCE_DIR" rev-parse FETCH_HEAD)"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 1
if [[ -f "$STATE_DIR/built-sha" ]] && [[ "$(cat "$STATE_DIR/built-sha")" == "$SHA" ]]; then
  echo "Images already built for $SHA"
  exit 0
fi
git -C "$SOURCE_DIR" checkout --force --detach "$SHA"

# Sequential local builds; do not run migrations or restart any service.
docker build -t "ghcr.io/kolyagazha89/usd-2.0-api:$SHA" "$SOURCE_DIR/backend"
docker build --build-arg VITE_API_URL=https://api.usd-russia.ru \
  -t "ghcr.io/kolyagazha89/usd-2.0-frontend:$SHA" "$SOURCE_DIR/frontend"
printf '%s\n' "$SHA" > "$STATE_DIR/built-sha"
echo "Images built for $SHA; deployment requires separate approval"
