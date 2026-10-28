#!/usr/bin/env bash
# Mocked release rehearsal. Runs only on an isolated CI runner as root.
set -Eeuo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && -n "${GITHUB_RUN_ID:-}" && "$(id -u)" == 0 ]] ||
  { echo "Refusing mock rehearsal outside a disposable GitHub Actions runner" >&2; exit 1; }
OLD=1111111111111111111111111111111111111111
NEW=2222222222222222222222222222222222222222
ROOT=/home/usd/usd-deploy/deploy/home-pc
STATE=/var/lib/usd-deployer
TRUSTED_DIR=/etc/usd-deployer/compose
# The mock writes to fixed paths. Refuse any existing real deployment state,
# even if the CI environment variables were accidentally propagated on a host.
[[ ! -e "$ROOT/.env" && ! -e "$STATE/built-sha" && ! -e "$TRUSTED_DIR" ]] ||
  { echo "Existing deployment state found; refusing destructive mock rehearsal" >&2; exit 1; }
[[ -z "$(docker ps -aq --filter label=com.docker.compose.project=usd-home)" ]] ||
  { echo "Existing usd-home containers found; refusing mock rehearsal" >&2; exit 1; }
WORK="$(mktemp -d)"
cleanup() {
  rm -f /etc/usd-release-approved
  rm -rf "$TRUSTED_DIR" "$WORK"
}
trap cleanup EXIT
# Keep failure diagnostics inside the disposable CI rehearsal. The release
# helper intentionally redirects expected refusal output, so without this trap
# a failed assertion is otherwise invisible in GitHub Actions logs.
diagnose_failure() {
  local code="$1" line="$2" file
  echo "Mock release rehearsal failed at line $line (exit $code)" >&2
  for file in "$WORK"/*.log; do
    [[ -f "$file" ]] || continue
    echo "--- $(basename "$file") (last 12 lines) ---" >&2
    tail -n 12 "$file" >&2
  done
}
trap 'diagnose_failure "$?" "$LINENO"' ERR
mkdir -p "$ROOT" "$STATE" "$WORK/bin"
cat > "$ROOT/.env" <<EOF
USD_IMAGE_TAG=$OLD
POSTGRES_DB=usd
POSTGRES_USER=usd
POSTGRES_PASSWORD=test
DATABASE_URL=postgresql://usd:test@db:5432/usd
APP_DOMAIN=app.usd-russia.ru
API_DOMAIN=api.usd-russia.ru
ACME_EMAIL=test@example.org
EOF
chmod 600 "$ROOT/.env"
cp deploy/home-pc/compose.yaml "$ROOT/compose.yaml"
cp deploy/home-pc/compose.local.yaml "$ROOT/compose.local.yaml"
cp deploy/home-pc/compose.tunnel.yaml "$ROOT/compose.tunnel.yaml"
mkdir -p "$TRUSTED_DIR"
cp "$ROOT"/compose*.yaml "$TRUSTED_DIR/"
printf '%s\n' "$NEW" > "$STATE/built-sha"
printf '%s\n' "$NEW" > "$STATE/schema-approved-sha"
printf '%s\n' "$NEW" > /etc/usd-release-approved
cat > "$WORK/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == image && "${2:-}" == inspect ]]; then exit 0; fi
if [[ "${1:-}" == ps ]]; then
  case "$*" in
    *service=api*) echo mock-api ;;
    *service=frontend*) echo mock-frontend ;;
    *service=db*) echo mock-db ;;
    *) exit 1 ;;
  esac
  exit 0
fi
if [[ "${1:-}" == inspect ]]; then
  if [[ "$*" == *'.State.Health.Status'* ]]; then
    if [[ "${USD_TEST_DB_UNHEALTHY_BEFORE:-0}" == 1 ]] ||
       [[ -f "${USD_TEST_DB_BACKUP_LATCH:-/dev/null}" ]] ||
       { [[ "${USD_TEST_DB_UNHEALTHY_PERSISTENT:-0}" == 1 ]] && [[ -f "$USD_TEST_DB_LATCH" ]]; } ||
       { [[ "${USD_TEST_DB_UNHEALTHY_AFTER:-0}" == 1 || "${USD_TEST_DB_UNHEALTHY_PERSISTENT:-0}" == 1 ]] &&
         grep -q "^USD_IMAGE_TAG=$USD_TEST_NEW$" /home/usd/usd-deploy/deploy/home-pc/.env; }; then
      if [[ "${USD_TEST_DB_UNHEALTHY_PERSISTENT:-0}" == 1 ]]; then touch "$USD_TEST_DB_LATCH"; fi
      echo unhealthy
    else
      echo healthy
    fi
    exit 0
  fi
  if [[ "$*" == *'.Config.Image'* ]]; then
    service=api
    [[ "$*" != *mock-frontend* ]] || service=frontend
    tag="$(sed -n 's/^USD_IMAGE_TAG=//p' /home/usd/usd-deploy/deploy/home-pc/.env)"
    [[ "${USD_TEST_IMAGE_MISMATCH:-0}" != 1 ]] || tag=unverified
    if [[ "${USD_TEST_IMAGE_MISMATCH_AFTER:-0}" == 1 && "$tag" == "$USD_TEST_NEW" ]]; then tag=unverified; fi
    echo "ghcr.io/kolyagazha89/usd-2.0-$service:$tag"
    exit 0
  fi
  if [[ "${USD_TEST_TUNNEL_OVERLAY:-0}" == 1 ]]; then
    echo "/home/usd/usd-deploy/deploy/home-pc/compose.yaml,/home/usd/usd-deploy/deploy/home-pc/compose.tunnel.yaml"
  else
    echo "/home/usd/usd-deploy/deploy/home-pc/compose.yaml,/home/usd/usd-deploy/deploy/home-pc/compose.local.yaml"
  fi
  exit 0
fi
if [[ "${1:-}" == compose ]]; then
  case "$*" in
    *" config --quiet"*)
      [[ "${USD_TEST_FAIL_CONFIG:-0}" != 1 ]] || exit 1
      exit 0 ;;
    *" up -d --no-deps api frontend"*)
      current_tag="$(sed -n 's/^USD_IMAGE_TAG=//p' /home/usd/usd-deploy/deploy/home-pc/.env)"
      if [[ "$current_tag" == "$USD_TEST_NEW" ]]; then
        rm -f "$USD_TEST_ROLLBACK_MARKER"
      elif [[ -f "$USD_TEST_LOG" && "$(tail -n 1 "$USD_TEST_LOG")" == "up $USD_TEST_NEW" ]]; then
        touch "$USD_TEST_ROLLBACK_MARKER"
      fi
      echo "up $current_tag" >> "$USD_TEST_LOG"
      if [[ "${USD_TEST_INTERRUPT_RELEASE:-0}" == 1 ]] &&
         grep -q "^USD_IMAGE_TAG=$USD_TEST_NEW$" /home/usd/usd-deploy/deploy/home-pc/.env; then
        kill -TERM "$PPID"
      fi
      exit 0 ;;
    *" exec -T "*)
      if [[ "$*" == *" exec -T db "* ]]; then
        if [[ "$*" == *pg_dump* ]]; then
          [[ "${USD_TEST_FAIL_BACKUP:-0}" != 1 ]] || exit 1
          if [[ "${USD_TEST_DB_UNHEALTHY_AFTER_BACKUP:-0}" == 1 ]]; then touch "$USD_TEST_DB_BACKUP_LATCH"; fi
          printf 'mock-custom-format-dump'
        else
          cat >/dev/null
          [[ "${USD_TEST_FAIL_ARCHIVE_CHECK:-0}" != 1 ]] || exit 1
        fi
        exit 0
      fi
      if [[ "${USD_TEST_FAIL_ROLLBACK_READINESS:-0}" == 1 && -f "$USD_TEST_ROLLBACK_MARKER" ]] &&
         ! grep -q "^USD_IMAGE_TAG=$USD_TEST_NEW$" /home/usd/usd-deploy/deploy/home-pc/.env; then
        exit 1
      fi
      if [[ "${USD_TEST_FAIL_BASELINE_READINESS:-0}" == 1 && ! -f "$USD_TEST_ROLLBACK_MARKER" ]] &&
         ! grep -q "^USD_IMAGE_TAG=$USD_TEST_NEW$" /home/usd/usd-deploy/deploy/home-pc/.env; then
        exit 1
      fi
      if [[ "${USD_TEST_FAIL_READINESS:-0}" == 1 ]] &&
         grep -q "^USD_IMAGE_TAG=$USD_TEST_NEW$" /home/usd/usd-deploy/deploy/home-pc/.env; then
        exit 1
      fi
      exit 0 ;;
  esac
fi
echo "Unexpected mocked docker call: $*" >&2
exit 1
EOF
cat > "$WORK/bin/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$WORK/bin/cp" <<'EOF'
#!/usr/bin/env bash
# Simulate a failure restoring the original environment, never the initial snapshot.
if [[ "${USD_TEST_FAIL_ROLLBACK_COPY:-0}" == 1 &&
      "${1:-}" == -p && "${2:-}" == /var/lib/usd-deployer/release-env.* &&
      "${3:-}" == /home/usd/usd-deploy/deploy/home-pc/.env.rollback.* ]]; then
  exit 1
fi
exec /usr/bin/cp "$@"
EOF
chmod +x "$WORK/bin/docker" "$WORK/bin/sleep" "$WORK/bin/cp"
export PATH="$WORK/bin:$PATH"
export USD_TEST_LOG="$WORK/docker.log"
export USD_TEST_NEW="$NEW"
export USD_TEST_ROLLBACK_MARKER="$WORK/rollback-phase"
export USD_TEST_DB_BACKUP_LATCH="$WORK/db-unhealthy-after-backup"
# A caller cannot bypass the release lock by claiming an inherited lock
# without actually passing the trusted open file descriptor.
if USD_DEPLOY_LOCK_HELD=1 bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/forged-lock.log" 2>&1; then exit 1; fi
grep -q 'Missing trusted inherited deploy lock descriptor' "$WORK/forged-lock.log"
[[ ! -s "$USD_TEST_LOG" ]]
# Root-run Docker Compose must reject mutable/unreviewed YAML.
printf '\n# unreviewed local change\n' >> "$ROOT/compose.yaml"
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/unreviewed-compose.log" 2>&1; then exit 1; fi
grep -q 'differs from reviewed root-owned snapshot' "$WORK/unreviewed-compose.log"
cp "$TRUSTED_DIR/compose.yaml" "$ROOT/compose.yaml"
chmod 777 "$TRUSTED_DIR"
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/untrusted-compose-dir.log" 2>&1; then exit 1; fi
grep -q 'must not be group/world writable' "$WORK/untrusted-compose-dir.log"
chmod 755 "$TRUSTED_DIR"
[[ ! -s "$USD_TEST_LOG" ]]
chmod 640 "$ROOT/.env"
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/insecure-env.log" 2>&1; then
  echo "Expected insecure production environment to block release" >&2
  exit 1
fi
grep -q "must not be accessible to group" "$WORK/insecure-env.log"
[[ ! -s "$USD_TEST_LOG" ]]
chmod 600 "$ROOT/.env"
printf 'CLOUDFLARE_TUNNEL_TOKEN=ci-only\n' >> "$ROOT/.env"
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/leaked-tunnel-env.log" 2>&1; then exit 1; fi
grep -q 'Tunnel credential must be isolated' "$WORK/leaked-tunnel-env.log"
sed -i '/^CLOUDFLARE_TUNNEL_TOKEN=/d' "$ROOT/.env"
[[ ! -s "$USD_TEST_LOG" ]]
export USD_TEST_IMAGE_MISMATCH=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/image-mismatch.log" 2>&1; then exit 1; fi
grep -q 'Running images do not match' "$WORK/image-mismatch.log"
[[ ! -s "$USD_TEST_LOG" ]]
export USD_TEST_IMAGE_MISMATCH=0
export USD_TEST_TUNNEL_OVERLAY=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/missing-tunnel-env.log" 2>&1; then exit 1; fi
grep -q 'Missing, symlinked or non-root-owned tunnel credential file' "$WORK/missing-tunnel-env.log"
printf 'TUNNEL_TOKEN=ci-only\n' > "$ROOT/.env.cloudflared"
chmod 644 "$ROOT/.env.cloudflared"
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/insecure-tunnel-env.log" 2>&1; then exit 1; fi
grep -q 'Tunnel credential file must not be accessible' "$WORK/insecure-tunnel-env.log"
chmod 600 "$ROOT/.env.cloudflared"
export USD_TEST_TUNNEL_OVERLAY=0
[[ ! -s "$USD_TEST_LOG" ]]
export USD_TEST_DB_UNHEALTHY_BEFORE=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/db-unhealthy-before.log" 2>&1; then exit 1; fi
grep -q "Production DB is not healthy" "$WORK/db-unhealthy-before.log"
[[ ! -s "$USD_TEST_LOG" ]]
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
export USD_TEST_DB_UNHEALTHY_BEFORE=0
# Do not update a broken baseline: an unhealthy old API/frontend cannot be
# assumed to be a safe rollback target.
export USD_TEST_FAIL_BASELINE_READINESS=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/baseline-unhealthy.log" 2>&1; then exit 1; fi
grep -q 'Existing API/frontend failed pre-release readiness' "$WORK/baseline-unhealthy.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
[[ ! -s "$USD_TEST_LOG" ]]
unset USD_TEST_FAIL_BASELINE_READINESS
# A database that becomes unhealthy during backup must block the swap before
# either application container is replaced.
export USD_TEST_DB_UNHEALTHY_AFTER_BACKUP=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/db-unhealthy-after-backup.log" 2>&1; then exit 1; fi
grep -q 'Production DB became unhealthy during backup' "$WORK/db-unhealthy-after-backup.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
[[ ! -s "$USD_TEST_LOG" ]]
unset USD_TEST_DB_UNHEALTHY_AFTER_BACKUP
rm -f "$USD_TEST_DB_BACKUP_LATCH"
export USD_TEST_FAIL_BACKUP=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/backup-failure.log" 2>&1; then
  echo "Expected backup failure to block release" >&2
  exit 1
fi
[[ ! -s "$USD_TEST_LOG" ]]
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
export USD_TEST_FAIL_BACKUP=0
export USD_TEST_FAIL_ARCHIVE_CHECK=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/invalid-archive.log" 2>&1; then exit 1; fi
[[ ! -s "$USD_TEST_LOG" ]]
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
export USD_TEST_FAIL_ARCHIVE_CHECK=0
export USD_TEST_FAIL_CONFIG=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/config-failure.log" 2>&1; then
  echo "Expected Compose validation failure to block release" >&2
  exit 1
fi
[[ ! -s "$USD_TEST_LOG" ]]
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
[[ -z "$(find "$ROOT" -maxdepth 1 -name '.env.release.*' -print -quit)" ]] ||
  { echo "Sensitive staged .env was left behind after failed validation" >&2; exit 1; }
export USD_TEST_FAIL_CONFIG=0
# A healthy HTTP endpoint on the wrong container image must not count as a
# successful release. Confirm the original tag and readiness after rollback.
export USD_TEST_IMAGE_MISMATCH_AFTER=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/stale-image.log" 2>&1; then exit 1; fi
grep -q 'New API/frontend image tags do not match approved release SHA' "$WORK/stale-image.log"
grep -q 'Previous API/frontend passed readiness after rollback' "$WORK/stale-image.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
export USD_TEST_IMAGE_MISMATCH_AFTER=0
export USD_TEST_INTERRUPT_RELEASE=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/interrupted.log" 2>&1; then exit 1; fi
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
grep -q 'Previous API/frontend passed readiness after rollback' "$WORK/interrupted.log"
export USD_TEST_INTERRUPT_RELEASE=0
# Reset the mock rollback phase left by the previous interrupted release:
# the next invocation begins in baseline-preflight mode, not rollback mode.
rm -f "$USD_TEST_ROLLBACK_MARKER"
export USD_TEST_FAIL_READINESS=1
export USD_TEST_FAIL_ROLLBACK_READINESS=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/failed-release.log" 2>&1; then
  echo "Expected readiness failure but release succeeded" >&2
  exit 1
fi
grep -q 'CRITICAL: previous API/frontend failed readiness after rollback' "$WORK/failed-release.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
grep -q "up $NEW" "$USD_TEST_LOG"
grep -q "up $OLD" "$USD_TEST_LOG"
[[ -f /etc/usd-release-approved ]]
export USD_TEST_FAIL_ROLLBACK_READINESS=0
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/healthy-rollback.log" 2>&1; then
  echo "Expected new-version readiness failure but release succeeded" >&2
  exit 1
fi
grep -q 'Previous API/frontend passed readiness after rollback' "$WORK/healthy-rollback.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
export USD_TEST_FAIL_READINESS=0
export USD_TEST_DB_UNHEALTHY_AFTER=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/db-unhealthy-after.log" 2>&1; then exit 1; fi
grep -q "Production DB became unhealthy during release" "$WORK/db-unhealthy-after.log"
grep -q "Previous API/frontend passed readiness after rollback" "$WORK/db-unhealthy-after.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
export USD_TEST_DB_UNHEALTHY_AFTER=0
export USD_TEST_DB_UNHEALTHY_PERSISTENT=1
export USD_TEST_DB_LATCH="$WORK/db-unhealthy-latch"
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/db-still-unhealthy.log" 2>&1; then exit 1; fi
grep -q "CRITICAL: production DB is unhealthy after application rollback" "$WORK/db-still-unhealthy.log"
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
export USD_TEST_DB_UNHEALTHY_PERSISTENT=0
rm -f "$USD_TEST_DB_LATCH"
export USD_TEST_FAIL_READINESS=1
export USD_TEST_FAIL_ROLLBACK_COPY=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/restore-env-failure.log" 2>&1; then exit 1; fi
grep -q 'CRITICAL: could not restore previous production .env' "$WORK/restore-env-failure.log"
[[ -z "$(find "$ROOT" -maxdepth 1 -name '.env.rollback.*' -print -quit)" ]] ||
  { echo 'Rollback left a staged environment file' >&2; exit 1; }
# Deliberately failed restoration leaves the new tag in place. Repair the
# disposable test fixture explicitly before the next healthy release.
grep -q "^USD_IMAGE_TAG=$NEW$" "$ROOT/.env"
sed -i "s/^USD_IMAGE_TAG=$NEW$/USD_IMAGE_TAG=$OLD/" "$ROOT/.env"
export USD_TEST_FAIL_ROLLBACK_COPY=0
export USD_TEST_FAIL_READINESS=0
bash deploy/home-pc/release-approved.sh "$NEW"
grep -q "^USD_IMAGE_TAG=$NEW$" "$ROOT/.env"
[[ "$(cat "$STATE/deployed-sha")" == "$NEW" ]]
[[ ! -f /etc/usd-release-approved ]]
echo "Mocked release, healthy rollback and unhealthy rollback rehearsals passed"
