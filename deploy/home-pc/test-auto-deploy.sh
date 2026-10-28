#!/usr/bin/env bash
# Exercise production builder logic against a disposable Git repo and Docker mocks.
set -Eeuo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && -n "${GITHUB_RUN_ID:-}" && "$(id -u)" == 0 ]] ||
  { echo 'Run only in isolated GitHub Actions CI as root' >&2; exit 1; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/source/backend/prisma" "$WORK/state" "$WORK/bin"
REAL_GIT="$(command -v git)"
export REAL_GIT USD_TEST_WORK="$WORK"
"$REAL_GIT" -C "$WORK/source" init -q -b main
printf 'schema-v1\n' > "$WORK/source/backend/prisma/schema.prisma"
"$REAL_GIT" -C "$WORK/source" add .
"$REAL_GIT" -C "$WORK/source" -c user.name=QA -c user.email=qa@example.org commit -qm initial
OLD="$("$REAL_GIT" -C "$WORK/source" rev-parse HEAD)"
printf 'application-v2\n' > "$WORK/source/application.txt"
"$REAL_GIT" -C "$WORK/source" add .
"$REAL_GIT" -C "$WORK/source" -c user.name=QA -c user.email=qa@example.org commit -qm application
NEW="$("$REAL_GIT" -C "$WORK/source" rev-parse HEAD)"
SCHEMA="$("$REAL_GIT" -C "$WORK/source" rev-parse HEAD:backend/prisma)"
printf '%s\n' "$NEW" > "$WORK/source/.git/FETCH_HEAD"
printf 'USD_IMAGE_TAG=%s\n' "$OLD" > "$WORK/deploy.env"
touch "$WORK/enabled"
chmod 600 "$WORK/enabled" "$WORK/deploy.env"
python3 - "$WORK" <<'PY'
import pathlib,sys
work=sys.argv[1]
s=pathlib.Path('deploy/home-pc/auto-deploy.sh').read_text()
for old,new in {
 '/run/lock/usd-home-deploy.lock':work+'/lock',
 '/opt/usd-release-source':work+'/source',
 '/var/lib/usd-deployer':work+'/state',
 '/etc/usd-deploy-enabled':work+'/enabled',
 '/etc/usd-auto-release-schema':work+'/policy',
 '/home/usd/usd-deploy/deploy/home-pc/.env':work+'/deploy.env',
 '/usr/local/sbin/usd-release-approved':work+'/release',
 '/usr/local/libexec/usd-verify-main-ci':work+'/verify-ci',
 '/var/lib/docker':work,
}.items():s=s.replace(old,new)
pathlib.Path(work+'/builder').write_text(s)
PY
cat > "$WORK/bin/git" <<'SH'
#!/usr/bin/env bash
case "$*" in
 *'remote get-url origin') echo https://github.com/kolyagazha89/Usd-2.0.git ;;
 *'fetch --no-tags --depth=1 origin '*) exit 0 ;;
 *) exec "$REAL_GIT" "$@" ;;
esac
SH
cat > "$WORK/bin/docker" <<'SH'
#!/usr/bin/env bash
echo "$*" >> "$USD_TEST_WORK/docker.log"
if [[ "${1:-}" == image && "${2:-}" == inspect && "${USD_TEST_MISSING_IMAGE:-0}" == 1 && "$*" == *frontend* ]]; then exit 1; fi
[[ "${USD_TEST_FAIL_BUILD:-0}" != 1 ]]
SH
cat > "$WORK/bin/df" <<'SH'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\n/dev/mock 99999999 1 99999998 1%% /\n'
SH
cat > "$WORK/bin/awk" <<'SH'
#!/usr/bin/env bash
if [[ "$*" == *MemAvailable* ]]; then echo 8192; else exec /usr/bin/awk "$@"; fi
SH
cat > "$WORK/release" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$(cat "$USD_TEST_WORK/state/schema-approved-sha")" == "$1" ]]
[[ "$(cat "$USD_TEST_WORK/state/release-approved-sha")" == "$1" ]]
[[ "${USD_TEST_BUSY_RELEASE:-0}" != 1 ]] || exit 75
echo "$1" >> "$USD_TEST_WORK/releases.log"
[[ "${USD_TEST_FAIL_RELEASE:-0}" != 1 ]]
sed -i "s/^USD_IMAGE_TAG=.*/USD_IMAGE_TAG=$1/" "$USD_TEST_WORK/deploy.env"
SH
cat > "$WORK/verify-ci" <<'SH'
#!/usr/bin/env bash
echo "$*" >> "$USD_TEST_WORK/ci.log"
exit "${USD_TEST_CI_STATUS:-0}"
SH
chmod +x "$WORK/bin/"* "$WORK/release" "$WORK/verify-ci"
export PATH="$WORK/bin:$PATH"
# A missing operator switch must not build or release anything.
mv "$WORK/enabled" "$WORK/disabled"
bash "$WORK/builder" > "$WORK/disabled.log"
[[ ! -f "$WORK/docker.log" && ! -f "$WORK/releases.log" ]]
mv "$WORK/disabled" "$WORK/enabled"
# Even a root-owned checkout is unsafe if other local users can write to it.
chmod 777 "$WORK/source"
if bash "$WORK/builder" > "$WORK/insecure-source.log" 2>&1; then exit 1; fi
grep -q 'Deploy directory must not be group/world writable' "$WORK/insecure-source.log"
[[ ! -f "$WORK/docker.log" ]]
chmod 755 "$WORK/source"
# Default remains build-only, then an approved unchanged schema releases cached images.
bash "$WORK/builder" > "$WORK/build-only.log"
[[ ! -f "$WORK/releases.log" ]]
[[ "$(cat "$WORK/state/built-sha")" == "$NEW" ]]
printf '%s\n' "$SCHEMA" > "$WORK/policy"
chmod 600 "$WORK/policy"
# A pending or failed main push CI must not release even a locally built SHA.
export USD_TEST_CI_STATUS=75
bash "$WORK/builder" > "$WORK/pending-ci.log" 2>&1
grep -q 'Main CI not verified yet' "$WORK/pending-ci.log"
[[ ! -f "$WORK/releases.log" ]]
export USD_TEST_CI_STATUS=1
if bash "$WORK/builder" > "$WORK/failed-ci.log" 2>&1; then exit 1; fi
grep -q 'Main CI gate refused' "$WORK/failed-ci.log"
[[ ! -f "$WORK/releases.log" ]]
unset USD_TEST_CI_STATUS
grep -q "^$NEW 0$" "$WORK/ci.log"
# A failed image build cannot mark this version ready or invoke release.
printf '%040d\n' 0 > "$WORK/state/built-sha"
export USD_TEST_FAIL_BUILD=1
if bash "$WORK/builder" > "$WORK/build-failure.log" 2>&1; then exit 1; fi
[[ ! -f "$WORK/releases.log" ]]
[[ "$(cat "$WORK/state/built-sha")" != "$NEW" ]]
unset USD_TEST_FAIL_BUILD
printf '%s\n' "$NEW" > "$WORK/state/built-sha"
build_lines="$(grep -c '^build ' "$WORK/docker.log")"
bash "$WORK/builder" > "$WORK/release.log"
[[ "$(cat "$WORK/releases.log")" == "$NEW" ]]
[[ "$(grep -c '^build ' "$WORK/docker.log")" == "$build_lines" ]]
# A pruned frontend image must invalidate the cache and rebuild BOTH images.
export USD_TEST_MISSING_IMAGE=1
bash "$WORK/builder" > "$WORK/pruned-image.log"
[[ "$(grep -c '^build ' "$WORK/docker.log")" == "$((build_lines + 2))" ]]
unset USD_TEST_MISSING_IMAGE
# Lock contention is transient and must never quarantine a good build.
printf 'USD_IMAGE_TAG=%s\n' "$OLD" > "$WORK/deploy.env"
export USD_TEST_BUSY_RELEASE=1
lines="$(wc -l < "$WORK/releases.log")"
bash "$WORK/builder" > "$WORK/lock-contention.log" 2>&1
grep -q "retrying on next poll" "$WORK/lock-contention.log"
[[ ! -f "$WORK/state/failed-release-sha" ]]
[[ "$(wc -l < "$WORK/releases.log")" == "$lines" ]]
unset USD_TEST_BUSY_RELEASE
# Failed releases are quarantined instead of retrying the same broken SHA forever.
printf 'USD_IMAGE_TAG=%s\n' "$OLD" > "$WORK/deploy.env"
export USD_TEST_FAIL_RELEASE=1
if bash "$WORK/builder" > "$WORK/failed.log" 2>&1; then exit 1; fi
[[ "$(cat "$WORK/state/failed-release-sha")" == "$NEW" ]]
lines="$(wc -l < "$WORK/releases.log")"
if bash "$WORK/builder" > "$WORK/quarantine.log" 2>&1; then exit 1; fi
[[ "$(wc -l < "$WORK/releases.log")" == "$lines" ]]
unset USD_TEST_FAIL_RELEASE
# A changed Prisma tree must never invoke the release helper.
printf '%040d\n' 1 > "$WORK/policy"
if bash "$WORK/builder" > "$WORK/schema.log" 2>&1; then exit 1; fi
grep -q 'Schema changed' "$WORK/schema.log"
[[ "$(wc -l < "$WORK/releases.log")" == "$lines" ]]
printf '%s\n' "$SCHEMA" > "$WORK/policy"
# An overly permissive production environment must never reach the release helper.
chmod 644 "$WORK/deploy.env"
if bash "$WORK/builder" > "$WORK/env-permissions.log" 2>&1; then exit 1; fi
grep -q "must not be readable by group or other users" "$WORK/env-permissions.log"
[[ "$(wc -l < "$WORK/releases.log")" == "$lines" ]]
chmod 600 "$WORK/deploy.env"
chmod 666 "$WORK/policy"
if bash "$WORK/builder" > "$WORK/policy.log" 2>&1; then exit 1; fi
grep -q 'group/world writable' "$WORK/policy.log"
echo 'Automatic release policy, cached builds, schema gate and failed-SHA quarantine tests passed'
