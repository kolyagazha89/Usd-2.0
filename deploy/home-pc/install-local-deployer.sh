#!/usr/bin/env bash
# Installs inert, root-owned USD build/release helpers. Does NOT enable the timer.
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] || { echo "Run as root" >&2; exit 1; }
# Installing reviewed scripts and Compose snapshots while a release is running
# can replace the trust boundary between validation and docker compose up.
# Serialize installer, local builder and release under the same host lock.
exec 9>/run/lock/usd-home-deploy.lock
flock -n 9 || { echo "USD deployment is active; installer must retry later" >&2; exit 75; }
cd "$(dirname "$(realpath "$0")")"
for tool in git docker flock systemctl install bash awk df python3 cmp readlink; do
  command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }
done
docker compose version >/dev/null
for script in auto-deploy.sh release-approved.sh rehearse-schema-on-backup.sh verify-media-backup.sh verify-db-offsite-backup.sh test-release.sh test-auto-deploy.sh; do bash -n "$script"; done
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("verify-main-ci.py").read_text())'
install -d -o root -g root -m 0755 /usr/local/libexec
install -o root -g root -m 0755 verify-main-ci.py /usr/local/libexec/usd-verify-main-ci
install -o root -g root -m 0750 rehearse-schema-on-backup.sh /usr/local/libexec/usd-rehearse-schema-on-backup
install -o root -g root -m 0750 verify-media-backup.sh /usr/local/libexec/usd-verify-media-backup
install -o root -g root -m 0750 verify-db-offsite-backup.sh /usr/local/libexec/usd-verify-db-offsite-backup
# Docker Compose runs as root through the release helper. Never execute a
# Compose YAML directly from the usd-owned checkout during an automatic release.
install -d -o root -g root -m 0755 /etc/usd-deployer/compose
for config in compose.yaml compose.local.yaml compose.tunnel.yaml; do
  install -o root -g root -m 0644 "$config" "/etc/usd-deployer/compose/$config"
done
install -d -o root -g root -m 0700 /var/lib/usd-deployer
install -o root -g root -m 0750 auto-deploy.sh /usr/local/sbin/usd-auto-deploy
install -o root -g root -m 0750 release-approved.sh /usr/local/sbin/usd-release-approved
install -o root -g root -m 0644 usd-auto-deploy.service /etc/systemd/system/usd-auto-deploy.service
install -o root -g root -m 0644 usd-auto-deploy.timer /etc/systemd/system/usd-auto-deploy.timer
systemctl daemon-reload
echo "USD helpers installed but NOT enabled. No production containers or DB changed."
echo "Do not enable until the supervised build and rollback test is approved."
