#!/usr/bin/env bash
# Opt-in narrow privilege for a dedicated, unprivileged GitHub runner account.
# This script does NOT register a runner, enable a timer or deploy USD.
set -Eeuo pipefail
umask 077
[[ "$(id -u)" == 0 ]] || { echo 'Run as root' >&2; exit 1; }
[[ $# == 1 && "$1" =~ ^[a-z_][a-z0-9_-]*$ ]] ||
  { echo 'Usage: install-runner-trigger.sh <dedicated-unprivileged-runner-user>' >&2; exit 2; }
runner="$1"
[[ "$runner" != root && "$(id -u "$runner" 2>/dev/null)" =~ ^[0-9]+$ &&
   "$(id -u "$runner")" != 0 ]] ||
  { echo 'Runner account must exist and must not be root' >&2; exit 1; }
for tool in systemctl visudo install runuser stat id sudo; do
  command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }
done
[[ "$(command -v systemctl)" == /usr/bin/systemctl ]] ||
  { echo 'Expected /usr/bin/systemctl; review sudoers path manually' >&2; exit 1; }
# Runner must not have unrestricted sudo or Docker access.
for group in $(id -nG "$runner"); do
  case "$group" in
    docker|sudo|wheel|root) echo "Unsafe runner group: $group" >&2; exit 1 ;;
  esac
done
if [[ -e /var/run/docker.sock ]] &&
   runuser -u "$runner" -- test -w /var/run/docker.sock; then
  echo 'Runner can access Docker socket; refusing privilege installation' >&2
  exit 1
fi
for protected in /etc/systemd/system/usd-auto-deploy.service /usr/local/sbin/usd-auto-deploy; do
  [[ -f "$protected" && ! -L "$protected" && "$(stat -c %u "$protected")" == 0 ]] ||
    { echo "Missing or untrusted root-owned service: $protected" >&2; exit 1; }
  (( (8#$(stat -c %a "$protected") & 022) == 0 )) ||
    { echo "Service must not be group/world writable: $protected" >&2; exit 1; }
done
destination=/etc/sudoers.d/usd-home-pc-trigger
[[ ! -e "$destination" && ! -L "$destination" ]] ||
  { echo "Existing runner sudoers policy; refusing to overwrite: $destination" >&2; exit 1; }
temp="$(mktemp /etc/sudoers.d/.usd-home-pc-trigger.XXXXXXXX)"
trap 'rm -f -- "$temp"' EXIT
printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl start usd-auto-deploy.service\n' "$runner" > "$temp"
chmod 0440 "$temp"
visudo -cf "$temp" >/dev/null
install -o root -g root -m 0440 "$temp" "$destination"
echo "Installed narrow trigger for $runner. Runner registration and deploy activation remain separate supervised steps."
