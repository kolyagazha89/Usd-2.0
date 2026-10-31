#!/usr/bin/env bash
# Install one checksum-pinned verifier. No image/service/database operations.
set -Eeuo pipefail
umask 077
[[ "$(id -u)" == 0 && $# == 0 ]] || { echo 'Run as root: install-cosign.sh' >&2; exit 2; }
[[ "$(uname -m)" == x86_64 && "$(uname -s)" == Linux ]] || { echo 'Reviewed cosign binary requires Linux x86_64' >&2; exit 1; }
expected=4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71
destination=/usr/local/libexec/usd-cosign
[[ ! -L /usr/local/libexec ]] || { echo 'Refusing symlinked tool directory' >&2; exit 1; }
if [[ -e /usr/local/libexec ]]; then
  [[ "$(stat -c %u /usr/local/libexec)" == 0 ]] &&
    (( (8#$(stat -c %a /usr/local/libexec) & 022) == 0 )) ||
    { echo 'Tool directory must already be root-controlled' >&2; exit 1; }
fi
install -d -o root -g root -m 0755 /usr/local/libexec
exec 8>/run/lock/usd-cosign-install.lock
flock -w 30 8 || exit 75
[[ ! -L "$destination" ]] || { echo 'Refusing symlinked verifier' >&2; exit 1; }
if [[ -f "$destination" && "$(stat -c %u "$destination")" == 0 ]] &&
   (( (8#$(stat -c %a "$destination") & 022) == 0 )) &&
   [[ "$(sha256sum "$destination" | awk '{print $1}')" == "$expected" ]]; then
  chmod 0755 "$destination"
  echo 'Pinned cosign v3.1.3 already installed'
  exit 0
fi
work="$(mktemp -d /usr/local/libexec/.usd-cosign.XXXXXXXX)"
trap 'rm -rf -- "$work"' EXIT
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --retry 3 --connect-timeout 10 --max-time 180 \
  https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64 -o "$work/cosign"
printf '%s  %s\n' "$expected" "$work/cosign" | sha256sum -c - >/dev/null
chmod 0755 "$work/cosign"
"$work/cosign" version --json >/dev/null
# Same filesystem rename avoids an executable partially overwritten on power loss.
mv -f -- "$work/cosign" "$destination"
echo 'Checksum-pinned cosign v3.1.3 installed; deployment remains separately gated'
