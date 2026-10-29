#!/usr/bin/env bash
# One supervised foreground prerelease on the home VM, never a silent auto-deploy.
set -Eeuo pipefail
umask 077
[[ "$(id -u)" == 0 && -r /dev/tty ]] || { echo 'Run with sudo in an interactive SSH terminal' >&2; exit 2; }

WORK=/home/usd/usd-deploy
SRC=/opt/usd-release-source
STATE=/var/lib/usd-deployer
TMP="$(mktemp -d /run/usd-finalize.XXXXXXXX)"
mounted_here=0
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$mounted_here" == 1 ]] && ! umount /srv/usd-backups; then
    echo 'WARNING: unmount temporary Windows admin share manually: sudo umount /srv/usd-backups' >&2
    [[ "$status" != 0 ]] || status=1
  fi
  rm -rf -- "$TMP"
  (( status == 0 )) || echo 'USD FINALIZE STOPPED: live database was never reset; verified HDD copies remain.' >&2
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
[[ -d "$WORK/.git" && -f "$WORK/deploy/home-pc/.env" ]] || { echo 'Existing USD checkout/env missing' >&2; exit 1; }
[[ ! -e /etc/usd-deploy-enabled ]] || { echo 'Auto-release gate is enabled; refusing simultaneous release' >&2; exit 1; }
[[ "$(systemctl is-enabled usd-auto-deploy.timer 2>/dev/null || true)" != enabled ]] ||
  { echo 'Auto-deploy timer is enabled; disable it before manual release' >&2; exit 1; }
mountpoint -q /srv/usd-s3 || { echo 'RustFS SSD not mounted' >&2; exit 1; }
[[ -f /etc/usd-s3/api.env ]] || { echo 'Restricted S3 IAM credentials missing' >&2; exit 1; }

# Must be the actual fetched current main; never deploy a moving draft PR.
SHA="$(git -C "$WORK" rev-parse FETCH_HEAD)"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || exit 1
[[ "$(git -C "$WORK" ls-remote origin refs/heads/main | awk '{print $1}')" == "$SHA" ]] ||
  { echo 'FETCH_HEAD is not current main. Run git fetch origin main again.' >&2; exit 1; }
python3 - "$WORK/deploy/home-pc/.env" <<'PY'
import sys
from pathlib import Path
pairs={}
for line in Path(sys.argv[1]).read_text().splitlines():
    if not line or line.lstrip().startswith("#") or "=" not in line: continue
    k,v=line.split("=",1)
    if k in pairs: raise SystemExit("Duplicate deployment .env setting")
    pairs[k]=v.strip().strip("'\"")
if (pairs.get("APP_DOMAIN"),pairs.get("API_DOMAIN"))!=("app.usd-russia.ru","api.usd-russia.ru"):
    raise SystemExit("Only prerelease USD domains are authorized")
if (pairs.get("S3_ENDPOINT"),pairs.get("S3_BUCKET"))!=("http://usd-s3:9000","usd-media"):
    raise SystemExit("Private S3 not staged; refusing deploy")
PY
echo "=== USD pre-release SHA: $SHA ==="
git -C "$WORK" show "$SHA:deploy/home-pc/s3/backup-to-second-disk.py" > "$TMP/backup.py"
git -C "$WORK" show "$SHA:deploy/home-pc/s3/verify-local-hdd-snapshot.py" > "$TMP/verify.py"
python3 -m py_compile "$TMP/backup.py" "$TMP/verify.py"

if ! command -v rclone >/dev/null || ! command -v mount.cifs >/dev/null; then
  apt-get update
  apt-get install -y rclone cifs-utils
fi
docker image inspect postgres:18-alpine >/dev/null 2>&1 || docker pull postgres:18-alpine
install -d -m 0700 /srv/usd-backups "$STATE"
if ! mountpoint -q /srv/usd-backups; then
  HOST="$(ip -4 route show default | awk '{print $3; exit}')"
  [[ "$HOST" =~ ^172\.17\.[0-9]+\.[0-9]+$ ]] || { echo 'Unexpected Hyper-V Windows gateway' >&2; exit 1; }
  printf 'Windows admin login (COMPUTER\\user or username): ' > /dev/tty
  IFS= read -r ADMIN </dev/tty
  printf 'Windows admin password (NOT PIN): ' > /dev/tty
  IFS= read -rs PASS </dev/tty
  printf '\n' > /dev/tty
  [[ -n "$ADMIN" && -n "$PASS" && "$ADMIN" != *$'\n'* && "$PASS" != *$'\n'* ]] ||
    { echo 'Invalid Windows credentials' >&2; exit 1; }
  CREDS="$TMP/cifs.cred"
  if [[ "$ADMIN" == *\\* ]]; then
    printf 'username=%s\ndomain=%s\npassword=%s\n' \
      "${ADMIN##*\\}" "${ADMIN%%\\*}" "$PASS" > "$CREDS"
  else
    printf 'username=%s\npassword=%s\n' "$ADMIN" "$PASS" > "$CREDS"
  fi
  chmod 0600 "$CREDS"
  unset ADMIN PASS
  mount -t cifs "//$HOST/C\$" /srv/usd-backups \
    -o "credentials=$CREDS,prefixpath=USD-Backups,vers=3.0,sec=ntlmssp,uid=0,gid=0,file_mode=0600,dir_mode=0700,nosuid,nodev,noexec"
  mounted_here=1
  rm -f -- "$CREDS"
fi
[[ "$(findmnt -n -o FSTYPE --mountpoint /srv/usd-backups)" == cifs ]] ||
  { echo 'Backup is not on Windows SMB HDD' >&2; exit 1; }
probe="$(mktemp /srv/usd-backups/.usd-test.XXXXXX)"
printf 'ok\n' > "$probe"
cmp -s <(printf 'ok\n') "$probe" || exit 1
rm -f -- "$probe"

echo '=== Full second-HDD S3 + PostgreSQL snapshot and real restore ==='
python3 "$TMP/backup.py" --backup | tee "$TMP/backup.log"
SNAP="$(sed -n 's/^Snapshot: //p' "$TMP/backup.log" | tail -n 1)"
[[ "$SNAP" == /srv/usd-backups/snapshots/* && -n "$SNAP" ]] || { echo 'Missing verified backup receipt' >&2; exit 1; }
python3 "$TMP/verify.py" "$SNAP"

echo '=== Preparing reviewed candidate and published GitHub CI ==='
[[ -d "$SRC/.git" && ! -L "$SRC" && "$(stat -c %u "$SRC")" == 0 ]] ||
  { echo 'Trusted root release source missing' >&2; exit 1; }
git -C "$SRC" fetch --no-tags origin main
[[ "$(git -C "$SRC" rev-parse FETCH_HEAD)" == "$SHA" ]] ||
  { echo 'Main moved since backup; not releasing an old candidate' >&2; exit 1; }
git -C "$SRC" checkout --force --detach "$SHA"
git -C "$SRC" clean -ffdx
ci_ok=0
for attempt in $(seq 1 24); do
  if python3 "$SRC/deploy/home-pc/verify-main-ci.py" "$SHA" 1; then
    ci_ok=1; break
  else
    code=$?
    [[ "$code" == 75 ]] || { echo 'Main CI failed; release blocked' >&2; exit 1; }
  fi
  sleep 15
done
[[ "$ci_ok" == 1 ]] || { echo 'Main CI not ready; release blocked' >&2; exit 1; }
for item in api frontend; do
  image="ghcr.io/kolyagazha89/usd-2.0-$item:$SHA"
  ready=0
  for attempt in $(seq 1 18); do
    if docker pull "$image"; then ready=1; break; fi
    sleep 15
  done
  [[ "$ready" == 1 ]] || { echo "Missing published candidate: $item" >&2; exit 1; }
  [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" == "$SHA" ]] ||
    { echo "Candidate OCI revision mismatch: $item" >&2; exit 1; }
done

echo '=== Install reviewed helpers; preserve existing DB and ingress ==='
bash "$SRC/deploy/home-pc/install-local-deployer.sh"
python3 "$SRC/deploy/home-pc/prepare-host-files.py"
exec 9>/run/lock/usd-home-deploy.lock
flock -w 60 9 || { echo 'Another deployment has the lock' >&2; exit 75; }
python3 "$SRC/deploy/home-pc/s3/verify-local-hdd-snapshot.py" "$SNAP"
python3 "$SRC/deploy/home-pc/initial-schema.py" --check "$SHA"
for file in built-sha schema-approved-sha release-approved-sha; do
  install -o root -g root -m 0600 /dev/null "$STATE/$file"
  printf '%s\n' "$SHA" > "$STATE/$file"
done
export USD_DEPLOY_LOCK_HELD=1 USD_ACCEPT_SAME_HOST_BACKUP=1
echo '=== Fresh isolated candidate PG18 restore + Prisma rehearsal ==='
/usr/local/sbin/usd-release-approved "$SHA" --preflight-only --local-hdd-snapshot "$SNAP"
echo '=== Apply only reviewed additive schema changes (if any) ==='
python3 "$SRC/deploy/home-pc/initial-schema.py" --apply "$SHA"
echo '=== API/frontend release with built-in rollback ==='
/usr/local/sbin/usd-release-approved "$SHA" --local-hdd-snapshot "$SNAP"
unset USD_DEPLOY_LOCK_HELD USD_ACCEPT_SAME_HOST_BACKUP
flock -u 9

echo '=== Public prerelease HTTPS verification ==='
python3 "$SRC/deploy/home-pc/verify-prerelease.py" "$SHA" ||
  { echo 'Local release health passed, but public HTTPS verification failed. Inspect prerelease ingress; do not change main domain.' >&2; exit 1; }
echo 'USD PRERELEASE VERIFIED: app.usd-russia.ru and api.usd-russia.ru'
echo 'Autodeploy stays paused until separately secured backup policy exists.'
