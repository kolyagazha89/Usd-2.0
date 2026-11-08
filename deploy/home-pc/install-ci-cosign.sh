#!/usr/bin/env bash
# Install the EXACT same checksum-pinned Cosign v3.1.3 used by the Ubuntu
# verifier. Avoid cosign-installer's extra bootstrap/bundle CDN dependencies.
# There is no unsigned fallback: checksum mismatch or download failure blocks
# image signing and therefore blocks root-owned Ubuntu deployment.
set -Eeuo pipefail
umask 077

[[ "${GITHUB_ACTIONS:-}" == "true" ]] || { echo 'GitHub Actions only' >&2; exit 2; }
[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]] || {
  echo 'Pinned Cosign binary requires Linux x86_64' >&2; exit 2;
}
[[ -n "${RUNNER_TEMP:-}" && -d "${RUNNER_TEMP}" ]] || {
  echo 'Missing GitHub runner temporary directory' >&2; exit 2;
}
[[ -n "${GITHUB_PATH:-}" && -f "${GITHUB_PATH}" && -w "${GITHUB_PATH}" ]] || {
  echo 'Missing GitHub Actions PATH command file' >&2; exit 2;
}

expected=4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71
url=https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64
directory="$(mktemp -d "${RUNNER_TEMP%/}/usd-cosign-ci.XXXXXXXX")"
trap 'rm -rf -- "$directory"' EXIT

# GitHub release CDN may briefly return 504s. Retry a *single pinned URL*,
# never accept a different version, unverified mirror, or tag-derived checksum.
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --retry 12 --retry-all-errors --retry-delay 2 --retry-max-time 240 \
  --connect-timeout 10 --max-time 40 "$url" -o "$directory/cosign.download"

printf '%s  %s\n' "$expected" "$directory/cosign.download" | sha256sum -c - >/dev/null || {
  echo 'Pinned Cosign SHA256 mismatch; release signing blocked' >&2
  exit 1
}
mv -f -- "$directory/cosign.download" "$directory/cosign"
chmod 0755 "$directory/cosign"
"$directory/cosign" version --json >/dev/null

# Publish to future Actions steps only after checksum and executable validation.
printf '%s\n' "$directory" >> "$GITHUB_PATH"
trap - EXIT
echo 'Checksum-pinned Cosign v3.1.3 ready for image signing'
