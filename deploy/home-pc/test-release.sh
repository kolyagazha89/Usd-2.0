#!/usr/bin/env bash
# Mocked release rehearsal. Runs only on an isolated CI runner as root.
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] || { echo "Run only in isolated CI as root" >&2; exit 1; }
OLD=1111111111111111111111111111111111111111
NEW=2222222222222222222222222222222222222222
ROOT=/home/usd/usd-deploy/deploy/home-pc
STATE=/var/lib/usd-deployer
WORK="$(mktemp -d)"
cleanup() {
  rm -f /etc/usd-release-approved
  rm -rf "$WORK"
}
trap cleanup EXIT
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
  if [[ "$*" == *'.Config.Image'* ]]; then
    service=api
    [[ "$*" != *mock-frontend* ]] || service=frontend
    tag="$(sed -n 's/^USD_IMAGE_TAG=//p' /home/usd/usd-deploy/deploy/home-pc/.env)"
    [[ "${USD_TEST_IMAGE_MISMATCH:-0}" != 1 ]] || tag=unverified
    echo "ghcr.io/kolyagazha89/usd-2.0-$service:$tag"
    exit 0
  fi
  echo "/home/usd/usd-deploy/deploy/home-pc/compose.yaml,/home/usd/usd-deploy/deploy/home-pc/compose.local.yaml"
  exit 0
fi
if [[ "${1:-}" == compose ]]; then
  case "$*" in
    *" config --quiet"*) exit 0 ;;
    *" up -d --no-deps api frontend"*)
      echo "up $(sed -n 's/^USD_IMAGE_TAG=//p' /home/usd/usd-deploy/deploy/home-pc/.env)" >> "$USD_TEST_LOG"
      if [[ "${USD_TEST_INTERRUPT_RELEASE:-0}" == 1 ]] &&
         grep -q "^USD_IMAGE_TAG=$USD_TEST_NEW$" /home/usd/usd-deploy/deploy/home-pc/.env; then
        kill -TERM "$PPID"
      fi
      exit 0 ;;
    *" exec -T "*)
      if [[ "$*" == *" exec -T db "* ]]; then
        if [[ "$*" == *pg_dump* ]]; then
          [[ "${USD_TEST_FAIL_BACKUP:-0}" != 1 ]] || exit 1
          printf 'mock-custom-format-dump'
        else
          cat >/dev/null
          [[ "${USD_TEST_FAIL_ARCHIVE_CHECK:-0}" != 1 ]] || exit 1
        fi
        exit 0
      fi
      if [[ "${USD_TEST_FAIL_ROLLBACK_READINESS:-0}" == 1 ]] &&
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
chmod +x "$WORK/bin/docker" "$WORK/bin/sleep"
export PATH="$WORK/bin:$PATH"
export USD_TEST_LOG="$WORK/docker.log"
export USD_TEST_NEW="$NEW"
export USD_TEST_IMAGE_MISMATCH=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/image-mismatch.log" 2>&1; then exit 1; fi
grep -q 'Running images do not match' "$WORK/image-mismatch.log"
[[ ! -s "$USD_TEST_LOG" ]]
export USD_TEST_IMAGE_MISMATCH=0
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
export USD_TEST_INTERRUPT_RELEASE=1
if bash deploy/home-pc/release-approved.sh "$NEW" > "$WORK/interrupted.log" 2>&1; then exit 1; fi
grep -q "^USD_IMAGE_TAG=$OLD$" "$ROOT/.env"
grep -q 'Previous API/frontend passed readiness after rollback' "$WORK/interrupted.log"
export USD_TEST_INTERRUPT_RELEASE=0
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
bash deploy/home-pc/release-approved.sh "$NEW"
grep -q "^USD_IMAGE_TAG=$NEW$" "$ROOT/.env"
[[ "$(cat "$STATE/deployed-sha")" == "$NEW" ]]
[[ ! -f /etc/usd-release-approved ]]
echo "Mocked release, healthy rollback and unhealthy rollback rehearsals passed"
