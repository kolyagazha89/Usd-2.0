#!/usr/bin/env bash
# All host paths are rewritten into a private temporary directory below and
# Docker is replaced with a mock. No production host fixture is installed.
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] ||
  { echo 'Run as root to exercise root-owned policy checks' >&2; exit 1; }
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
export USD_TEST_MAIN_SHA="$NEW" USD_TEST_OLD_SHA="$OLD"
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
 '/etc/usd-deployer/local-second-disk-approved':work+'/local-policy',
 '/usr/local/libexec/usd-verify-second-disk-db-backup':work+'/db-verify',
 '/usr/local/libexec/usd-verify-second-disk-media-backup':work+'/media-verify',
 '/home/usd/usd-deploy/deploy/home-pc/.env':work+'/deploy.env',
 '/usr/local/sbin/usd-release-approved':work+'/release',
 '/usr/local/libexec/usd-verify-main-ci':work+'/verify-ci',
 '/usr/local/libexec/usd-verify-image-signature':work+'/verify-signature',
 '/var/lib/docker':work,
}.items():s=s.replace(old,new)
pathlib.Path(work+'/builder').write_text(s)
PY
cat > "$WORK/verify-signature" <<'SIGNATURE'
#!/usr/bin/env bash
[[ "${USD_TEST_FAIL_SIGNATURE:-0}" != 1 ]]
SIGNATURE
chmod 0755 "$WORK/verify-signature"
cat > "$WORK/bin/git" <<'SH'
#!/usr/bin/env bash
case "$*" in
 *'remote get-url origin') echo https://github.com/kolyagazha89/Usd-2.0.git ;;
 *'fetch --no-tags --depth=1 origin '*) exit 0 ;;
 *'ls-remote --exit-code origin refs/heads/main')
   if [[ -f "$USD_TEST_WORK/main-moved-during-media" ]]; then
     printf '%s\trefs/heads/main\n' "$USD_TEST_OLD_SHA"
   else
     printf '%s\trefs/heads/main\n' "${USD_TEST_REMOTE_SHA:-$USD_TEST_MAIN_SHA}"
   fi ;;
 *) exec "$REAL_GIT" "$@" ;;
esac
SH
cat > "$WORK/bin/docker" <<'SH'
#!/usr/bin/env bash
echo "$*" >> "$USD_TEST_WORK/docker.log"
if [[ "${1:-}" == image && "${2:-}" == inspect ]]; then
  if [[ "${USD_TEST_MISSING_IMAGE:-0}" == 1 && "$*" == *frontend* && ! -e "$USD_TEST_WORK/frontend-pulled" ]]; then exit 1; fi
  if [[ "$*" == *org.opencontainers.image.revision* ]]; then
    printf '%s\n' "${USD_TEST_IMAGE_REVISION:-$USD_TEST_MAIN_SHA}"
  fi
fi
if [[ "${1:-}" == pull ]]; then
  [[ "${USD_TEST_FAIL_PULL:-}" != api || "$*" != *usd-2.0-api:* ]] || exit 1
  [[ "${USD_TEST_FAIL_PULL:-}" != frontend || "$*" != *usd-2.0-frontend:* ]] || exit 1
  [[ "$*" != *frontend* ]] || touch "$USD_TEST_WORK/frontend-pulled"
fi
[[ "${1:-}" != build ]] || { echo 'Home host must use published images' >&2; exit 1; }
SH
cat > "$WORK/bin/df" <<'SH'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\n/dev/mock 99999999 1 99999998 1%% /\n'
SH
cat > "$WORK/bin/awk" <<'SH'
#!/usr/bin/env bash
if [[ "$*" == *MemAvailable* ]]; then echo "${USD_TEST_AVAILABLE_MB:-8192}"; else exec /usr/bin/awk "$@"; fi
SH
cat > "$WORK/release" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
# The builder must not release its exclusive lock before invoking the helper.
[[ "${USD_DEPLOY_LOCK_HELD:-0}" == 1 && "${USD_LOCAL_SECOND_DISK_APPROVED:-0}" == 1 ]]
[[ "$(readlink /proc/self/fd/9)" == "$USD_TEST_WORK/lock" ]]
exec 10>"$USD_TEST_WORK/lock"
if flock -n 10; then echo 'Builder released its lock before handoff' >&2; exit 1; fi
[[ "$(cat "$USD_TEST_WORK/state/schema-approved-sha")" == "$1" ]]
[[ "$(cat "$USD_TEST_WORK/state/release-approved-sha")" == "$1" ]]
[[ "${USD_TEST_BUSY_RELEASE:-0}" != 1 ]] || exit 75
echo "$1" >> "$USD_TEST_WORK/releases.log"
[[ "${USD_TEST_FAIL_RELEASE:-0}" != 1 ]]
sed -i "s/^USD_IMAGE_TAG=.*/USD_IMAGE_TAG=$1/" "$USD_TEST_WORK/deploy.env"
SH
cat > "$WORK/media-verify" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$#" == 1 && "$1" == media* ]] || exit 1
echo "$*" >> "$USD_TEST_WORK/media.log"
if [[ "${USD_TEST_MOVE_MAIN_DURING_MEDIA:-0}" == 1 ]]; then
  touch "$USD_TEST_WORK/main-moved-during-media"
fi
[[ "${USD_TEST_FAIL_MEDIA:-0}" != 1 ]]
SH
cat > "$WORK/verify-ci" <<'SH'
#!/usr/bin/env bash
echo "$*" >> "$USD_TEST_WORK/ci.log"
exit "${USD_TEST_CI_STATUS:-0}"
SH
cat > "$WORK/bin/findmnt" <<'SH'
#!/usr/bin/env bash
printf '/dev/sdb1\n'
SH
chmod +x "$WORK/bin/"* "$WORK/release" "$WORK/verify-ci" "$WORK/media-verify"
export PATH="$WORK/bin:$PATH"
# A missing operator switch must not build or release anything.
mv "$WORK/enabled" "$WORK/disabled"
bash "$WORK/builder" > "$WORK/disabled.log"
[[ ! -f "$WORK/docker.log" && ! -f "$WORK/releases.log" ]]
mv "$WORK/disabled" "$WORK/enabled"
# A writable operator switch must not authorize privileged local builds.
chmod 666 "$WORK/enabled"
bash "$WORK/builder" > "$WORK/insecure-switch.log"
grep -q 'USD deploy disabled' "$WORK/insecure-switch.log"
[[ ! -f "$WORK/docker.log" ]]
chmod 600 "$WORK/enabled"
# Even a root-owned checkout is unsafe if other local users can write to it.
chmod 777 "$WORK/source"
if bash "$WORK/builder" > "$WORK/insecure-source.log" 2>&1; then exit 1; fi
grep -q 'Deploy directory must not be group/world writable' "$WORK/insecure-source.log"
[[ ! -f "$WORK/docker.log" ]]
chmod 755 "$WORK/source"
# Pulling published images does not need the old 3 GiB compilation budget,
# but must retain room for the bounded disposable PostgreSQL/Prisma containers.
export USD_TEST_AVAILABLE_MB=1024
if bash "$WORK/builder" > "$WORK/low-memory.log" 2>&1; then exit 1; fi
grep -q 'Insufficient memory' "$WORK/low-memory.log"
[[ ! -f "$WORK/docker.log" ]]
export USD_TEST_AVAILABLE_MB=2048
# Default remains build-only, then an approved unchanged schema releases cached images.
bash "$WORK/builder" > "$WORK/build-only.log"
[[ ! -f "$WORK/releases.log" ]]
[[ "$(cat "$WORK/state/built-sha")" == "$NEW" ]]
[[ "$(grep -c '^pull ' "$WORK/docker.log")" == 2 ]]
! grep -q '^build ' "$WORK/docker.log"
# An available tag with an invalid/missing signature must remain build-only.
USD_TEST_FAIL_SIGNATURE=1 bash "$WORK/builder" > "$WORK/signature-refused.log" 2>&1
grep -q 'Published signatures not verified' "$WORK/signature-refused.log"
[[ ! -f "$WORK/releases.log" ]]
# Cached images are checked too; a marker is not evidence of their provenance.
export USD_TEST_IMAGE_REVISION="$OLD"
if bash "$WORK/builder" > "$WORK/wrong-cached-revision.log" 2>&1; then exit 1; fi
grep -q 'Image revision does not match' "$WORK/wrong-cached-revision.log"
[[ ! -f "$WORK/releases.log" ]]
unset USD_TEST_IMAGE_REVISION
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
# A main push arriving during the build must not release the stale SHA.
export USD_TEST_REMOTE_SHA="$OLD"
bash "$WORK/builder" > "$WORK/stale-main.log" 2>&1
grep -q 'deferring stale release' "$WORK/stale-main.log"
[[ ! -f "$WORK/releases.log" ]]
unset USD_TEST_REMOTE_SHA
# Malformed remote responses also defer without quarantining the commit.
export USD_TEST_REMOTE_SHA=not-a-git-sha
bash "$WORK/builder" > "$WORK/invalid-main.log" 2>&1
grep -q 'Invalid main branch tip response' "$WORK/invalid-main.log"
[[ ! -f "$WORK/releases.log" ]]
unset USD_TEST_REMOTE_SHA
# Second-disk acceptance and a fresh media snapshot are mandatory.
bash "$WORK/builder" > "$WORK/no-local-policy.log"
grep -q 'Second-disk risk acceptance missing' "$WORK/no-local-policy.log"
[[ ! -f "$WORK/releases.log" ]]
printf 'SAME_PC_SECOND_DISK_ACCEPTED\n' > "$WORK/local-policy"
chmod 666 "$WORK/local-policy"
if bash "$WORK/builder" > "$WORK/insecure-local-policy.log" 2>&1; then exit 1; fi
grep -q 'Local backup approval must be private' "$WORK/insecure-local-policy.log"
chmod 600 "$WORK/local-policy"
touch "$WORK/db-verify"
chmod 700 "$WORK/db-verify"
export USD_TEST_FAIL_MEDIA=1
bash "$WORK/builder" > "$WORK/media-failure.log" 2>&1
grep -q 'Second-disk media snapshot failed' "$WORK/media-failure.log"
[[ ! -f "$WORK/releases.log" && ! -f "$WORK/state/failed-release-sha" ]]
unset USD_TEST_FAIL_MEDIA
export USD_TEST_MOVE_MAIN_DURING_MEDIA=1
bash "$WORK/builder" > "$WORK/main-moved-during-media.log" 2>&1
grep -q 'Main moved or became unverifiable' "$WORK/main-moved-during-media.log"
[[ ! -f "$WORK/releases.log" ]]
rm -f "$WORK/main-moved-during-media"
unset USD_TEST_MOVE_MAIN_DURING_MEDIA
# Neither a failed first pull nor a successful API/failed frontend pull may
# mark the candidate ready or invoke the release helper.
for image in api frontend; do
  printf '%040d\n' 0 > "$WORK/state/built-sha"
  export USD_TEST_FAIL_PULL="$image"
  if bash "$WORK/builder" > "$WORK/pull-failure-$image.log" 2>&1; then exit 1; fi
  [[ ! -f "$WORK/releases.log" ]]
  [[ "$(cat "$WORK/state/built-sha")" != "$NEW" ]]
done
unset USD_TEST_FAIL_PULL
# A mistagged image must fail closed, including an already cached candidate.
export USD_TEST_IMAGE_REVISION="$OLD"
if bash "$WORK/builder" > "$WORK/wrong-image-revision.log" 2>&1; then exit 1; fi
grep -q 'Image revision does not match' "$WORK/wrong-image-revision.log"
[[ "$(cat "$WORK/state/built-sha")" != "$NEW" ]]
unset USD_TEST_IMAGE_REVISION
printf '%s\n' "$NEW" > "$WORK/state/built-sha"
pull_lines="$(grep -c '^pull ' "$WORK/docker.log")"
bash "$WORK/builder" > "$WORK/release.log"
[[ "$(cat "$WORK/releases.log")" == "$NEW" ]]
[[ "$(grep -c '^pull ' "$WORK/docker.log")" == "$pull_lines" ]]
# A pruned frontend image invalidates the cache and reacquires both images.
export USD_TEST_MISSING_IMAGE=1
rm -f "$WORK/frontend-pulled"
bash "$WORK/builder" > "$WORK/pruned-image.log"
[[ "$(grep -c '^pull ' "$WORK/docker.log")" == "$((pull_lines + 2))" ]]
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
# A frontend change must require BOTH main CI workflows, not backend only.
chmod 600 "$WORK/policy"
mkdir -p "$WORK/source/frontend"
printf 'frontend-v3\n' > "$WORK/source/frontend/app.txt"
"$REAL_GIT" -C "$WORK/source" add frontend/app.txt
"$REAL_GIT" -C "$WORK/source" -c user.name=QA -c user.email=qa@example.org commit -qm frontend
NEWER="$("$REAL_GIT" -C "$WORK/source" rev-parse HEAD)"
printf '%s\n' "$NEWER" > "$WORK/source/.git/FETCH_HEAD"
export USD_TEST_MAIN_SHA="$NEWER"
bash "$WORK/builder" > "$WORK/frontend-change.log"
grep -q "^$NEWER 1$" "$WORK/ci.log"
grep -q "^$NEWER$" "$WORK/releases.log"
echo 'Published image pulls, partial-download refusal, revision checks, release policies, schema and quarantine tests passed'
