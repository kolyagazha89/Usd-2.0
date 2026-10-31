#!/usr/bin/env bash
# Install reviewed backup-only helpers and disabled units. Never enable a timer.
set -Eeuo pipefail
umask 077
[[ "$(id -u)" == 0 && $# == 0 ]] || { echo 'Run as root without arguments' >&2; exit 2; }
exec 9>/run/lock/usd-home-deploy.lock
flock -n 9 || { echo 'USD deploy/backup lock busy; installer must retry later' >&2; exit 75; }
cd "$(dirname "$(realpath "$0")")"
for tool in python3 bash install flock systemctl stat; do
  command -v "$tool" >/dev/null || { echo "Missing installer dependency: $tool" >&2; exit 1; }
done
[[ ! -e /etc/usd-backup-enabled && ! -L /etc/usd-backup-enabled ]] ||
  { echo 'Remove the reviewed backup enablement gate during supervised installation; no units changed' >&2; exit 1; }
if systemctl is-active --quiet usd-daily-backup.timer || systemctl is-enabled --quiet usd-daily-backup.timer; then
  echo 'Stop and disable the existing backup timer before supervised helper replacement' >&2
  exit 1
fi
for directory in /usr/local/sbin /usr/local/libexec /etc/systemd/system /var/lib/usd-deployer /etc/usd-deployer; do
  ancestor="$directory"
  while [[ "$ancestor" != / ]]; do
    [[ ! -L "$ancestor" ]] || { echo 'Refusing symlinked backup installation directory/ancestor' >&2; exit 1; }
    ancestor="${ancestor%/*}"
    [[ -n "$ancestor" ]] || ancestor=/
  done
  if [[ -e "$directory" ]]; then
    [[ -d "$directory" && "$(stat -c %u "$directory")" == 0 ]] &&
      (( (8#$(stat -c %a "$directory") & 022) == 0 )) ||
      { echo 'Backup installation directory is not root-controlled' >&2; exit 1; }
  fi
done
for script in verify-db-offsite-backup.sh verify-media-backup.sh rehearse-schema-on-backup.sh; do
  [[ -f "$script" && ! -L "$script" ]] || exit 1
  bash -n "$script"
done
[[ -f daily-backup.py && ! -L daily-backup.py ]] || exit 1
python3 -I -c 'from pathlib import Path; compile(Path("daily-backup.py").read_bytes(), "daily-backup.py", "exec")'
install -d -o root -g root -m 0755 /usr/local/sbin /usr/local/libexec /etc/systemd/system
install -d -o root -g root -m 0700 /var/lib/usd-deployer /etc/usd-deployer
install -o root -g root -m 0750 daily-backup.py /usr/local/sbin/usd-daily-backup
install -o root -g root -m 0750 verify-db-offsite-backup.sh /usr/local/libexec/usd-verify-db-offsite-backup
install -o root -g root -m 0750 verify-media-backup.sh /usr/local/libexec/usd-verify-media-backup
install -o root -g root -m 0750 rehearse-schema-on-backup.sh /usr/local/libexec/usd-rehearse-schema-on-backup
install -o root -g root -m 0644 usd-daily-backup.service /etc/systemd/system/usd-daily-backup.service
install -o root -g root -m 0644 usd-daily-backup.timer /etc/systemd/system/usd-daily-backup.timer
systemctl daemon-reload
echo 'Backup-only helpers installed; timer NOT enabled and no policy/credentials/gate created.'
echo 'Complete DAILY_BACKUPS.md supervised review and verified first run before enabling the timer.'
