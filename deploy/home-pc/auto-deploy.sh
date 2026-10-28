#!/usr/bin/env bash
# USD main builder with an optional, schema-pinned automatic release policy.
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
else
git -C "$SOURCE_DIR" checkout --force --detach "$SHA"

# Sequential local builds; do not run migrations or restart any service.
docker build -t "ghcr.io/kolyagazha89/usd-2.0-api:$SHA" "$SOURCE_DIR/backend"
docker build --build-arg VITE_API_URL=https://api.usd-russia.ru \
  -t "ghcr.io/kolyagazha89/usd-2.0-frontend:$SHA" "$SOURCE_DIR/frontend"
printf '%s\n' "$SHA" > "$STATE_DIR/built-sha"
fi

# Existing installations stay build-only until the operator pins the schema
# they have actually verified on the host. Schema changes always stop here.
POLICY=/etc/usd-auto-release-schema
if [[ ! -f "$POLICY" ]]; then
  echo "Images built for $SHA; automatic release policy is not enabled"
  exit 0
fi
[[ ! -L "$POLICY" && "$(stat -c %u "$POLICY")" == 0 ]] ||
  { echo "Automatic release policy must be root-owned and not a symlink" >&2; exit 1; }
(( (8#$(stat -c %a "$POLICY") & 022) == 0 )) ||
  { echo "Automatic release policy must not be group/world writable" >&2; exit 1; }
approved_schema="$(cat "$POLICY")"
[[ "$approved_schema" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid approved Prisma tree SHA" >&2; exit 1; }
schema="$(git -C "$SOURCE_DIR" rev-parse "$SHA:backend/prisma")"
[[ "$schema" == "$approved_schema" ]] || { echo "Schema changed; supervised migration and new schema approval required" >&2; exit 1; }
DEPLOY_ENV=/home/usd/usd-deploy/deploy/home-pc/.env
[[ -f "$DEPLOY_ENV" && ! -L "$DEPLOY_ENV" ]] || { echo "Missing deployment environment" >&2; exit 1; }
OLD_TAG="$(sed -n -E 's/^USD_IMAGE_TAG=([a-f0-9]{40})$/\1/p' "$DEPLOY_ENV")"
[[ "$OLD_TAG" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid deployed SHA" >&2; exit 1; }
[[ "$OLD_TAG" != "$SHA" ]] || { echo "Already deployed $SHA"; exit 0; }
git -C "$SOURCE_DIR" fetch --no-tags --depth=1 origin "$OLD_TAG"
old_schema="$(git -C "$SOURCE_DIR" rev-parse "$OLD_TAG:backend/prisma")"
[[ "$old_schema" == "$approved_schema" ]] || { echo "Current deployment schema differs from approved policy" >&2; exit 1; }
if [[ -f "$STATE_DIR/failed-release-sha" && "$(cat "$STATE_DIR/failed-release-sha")" == "$SHA" ]]; then
  echo "This SHA already failed release; inspect logs before explicitly clearing failed-release-sha" >&2
  exit 1
fi
printf '%s\n' "$SHA" > "$STATE_DIR/schema-approved-sha"
printf '%s\n' "$SHA" > "$STATE_DIR/release-approved-sha"
# The release helper takes the same lock and verifies built-sha again.
flock -u 9
if /usr/local/sbin/usd-release-approved "$SHA"; then
  rm -f "$STATE_DIR/failed-release-sha"
else
  printf '%s\n' "$SHA" > "$STATE_DIR/failed-release-sha"
  exit 1
fi
