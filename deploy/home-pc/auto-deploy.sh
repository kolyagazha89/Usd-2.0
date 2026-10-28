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
if [[ ! -f /etc/usd-deploy-enabled || -L /etc/usd-deploy-enabled || "$(stat -c %u /etc/usd-deploy-enabled 2>/dev/null)" != 0 ]] ||
   (( (8#$(stat -c %a /etc/usd-deploy-enabled 2>/dev/null || echo 777) & 022) != 0 )); then
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
# A root-owned but group-writable checkout is still unsafe: another local
# account could inject files into the Docker build context or rewrite Git refs.
for protected_dir in "$SOURCE_DIR" "$SOURCE_DIR/.git" "$STATE_DIR"; do
  [[ -d "$protected_dir" && ! -L "$protected_dir" && "$(stat -c %u "$protected_dir")" == 0 ]] ||
    { echo "Unsafe ownership or symlink in deploy directory: $protected_dir" >&2; exit 1; }
  (( (8#$(stat -c %a "$protected_dir") & 022) == 0 )) ||
    { echo "Deploy directory must not be group/world writable: $protected_dir" >&2; exit 1; }
done
[[ "$(git -C "$SOURCE_DIR" remote get-url origin)" == "$REPO" ]] || { echo "Unexpected Git remote" >&2; exit 1; }
git -C "$SOURCE_DIR" fetch --no-tags --depth=1 origin main
SHA="$(git -C "$SOURCE_DIR" rev-parse FETCH_HEAD)"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 1
# A cached SHA is valid only while BOTH locally built images still exist.
# Docker pruning can remove either tag without changing the Git commit.
images_cached=0
if [[ -f "$STATE_DIR/built-sha" && "$(cat "$STATE_DIR/built-sha")" == "$SHA" ]] &&
   docker image inspect "ghcr.io/kolyagazha89/usd-2.0-api:$SHA" >/dev/null 2>&1 &&
   docker image inspect "ghcr.io/kolyagazha89/usd-2.0-frontend:$SHA" >/dev/null 2>&1; then
  images_cached=1
fi
if [[ "$images_cached" == 1 ]]; then
  echo "Images already built for $SHA"
else
# Dedicated root-owned source checkout: discard all untracked build artifacts
# before Docker receives the build context, even after an interrupted build.
git -C "$SOURCE_DIR" checkout --force --detach "$SHA"
git -C "$SOURCE_DIR" clean -ffdx

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
(( (8#$(stat -c %a "$DEPLOY_ENV") & 077) == 0 )) || { echo "Deployment environment must not be readable by group or other users" >&2; exit 1; }
OLD_TAG="$(sed -n -E 's/^USD_IMAGE_TAG=([a-f0-9]{40})$/\1/p' "$DEPLOY_ENV")"
[[ "$OLD_TAG" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid deployed SHA" >&2; exit 1; }
[[ "$OLD_TAG" != "$SHA" ]] || { echo "Already deployed $SHA"; exit 0; }
git -C "$SOURCE_DIR" fetch --no-tags --depth=1 origin "$OLD_TAG"
old_schema="$(git -C "$SOURCE_DIR" rev-parse "$OLD_TAG:backend/prisma")"
[[ "$old_schema" == "$approved_schema" ]] || { echo "Current deployment schema differs from approved policy" >&2; exit 1; }
# Do not auto-release an untested main commit. Backend CI runs on every main
# push; frontend CI is path-filtered, so require it only when frontend changed.
frontend_changes="$(git -C "$SOURCE_DIR" diff --name-only "$OLD_TAG" "$SHA" -- frontend)" ||
  { echo "Cannot compare frontend trees for CI policy" >&2; exit 1; }
frontend_changed=0
[[ -z "$frontend_changes" ]] || frontend_changed=1
if /usr/local/libexec/usd-verify-main-ci "$SHA" "$frontend_changed"; then
  :
else
  ci_status=$?
  if [[ "$ci_status" == 75 ]]; then
    echo "Main CI not verified yet; leaving current deployment untouched" >&2
    exit 0
  fi
  echo "Main CI gate refused automatic release" >&2
  exit "$ci_status"
fi
# A main push may land while a large local Docker build is running. CI
# approval for the original SHA must never publish it as the newest release
# after the branch tip has moved. Defer rather than quarantine the old SHA;
# the next timer poll will build and validate the newer main commit.
remote_main="$(git -C "$SOURCE_DIR" ls-remote --exit-code origin refs/heads/main)" || {
  echo "Cannot recheck main branch after CI; deferring release" >&2
  exit 0
}
latest_main="$(awk '$2 == "refs/heads/main" {print $1}' <<< "$remote_main")"
[[ "$latest_main" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Invalid main branch tip response; deferring release" >&2
  exit 0
}
if [[ "$latest_main" != "$SHA" ]]; then
  echo "Main moved from $SHA to $latest_main during build/CI; deferring stale release" >&2
  exit 0
fi
if [[ -f "$STATE_DIR/failed-release-sha" && "$(cat "$STATE_DIR/failed-release-sha")" == "$SHA" ]]; then
  echo "This SHA already failed release; inspect logs before explicitly clearing failed-release-sha" >&2
  exit 1
fi
printf '%s\n' "$SHA" > "$STATE_DIR/schema-approved-sha"
printf '%s\n' "$SHA" > "$STATE_DIR/release-approved-sha"
# Keep the SAME lock continuously across build, CI approval and release.
# Unlocking here allowed a second builder to replace built-sha between
# approval and release, spuriously quarantining an otherwise healthy commit.
# The helper verifies the inherited descriptor before reusing it.
if USD_DEPLOY_LOCK_HELD=1 /usr/local/sbin/usd-release-approved "$SHA"; then
  rm -f "$STATE_DIR/failed-release-sha"
else
  status=$?
  # The helper acquires its own lock after we release ours. A competing
  # builder/release can win that hand-off; do not quarantine a healthy SHA.
  if [[ "$status" == 75 ]]; then
    echo "Another USD deployment acquired the lock; retrying on next poll" >&2
    exit 0
  fi
  printf '%s\n' "$SHA" > "$STATE_DIR/failed-release-sha"
  exit "$status"
fi
