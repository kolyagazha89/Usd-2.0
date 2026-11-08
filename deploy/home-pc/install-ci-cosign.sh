#!/usr/bin/env bash
# Install a version-pinned Cosign for GitHub Actions image signing.
# Two independently checksum-pinned official distributions: GitHub Releases
# and GHCR OCI v3.1.3. Both must pass their OWN exact digest checks before use.
# No arbitrary mirror, mutable image tag, or unsigned signing bypass.
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

expected_release=4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71
expected_oci=a57926e24b07f02b5baf3be81f9a5988e9e45d8a1ca8ca500cdf56d10e69f887
release_url=https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64
oci_image=ghcr.io/sigstore/cosign/cosign@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8

directory="$(mktemp -d "${RUNNER_TEMP%/}/usd-cosign-ci.XXXXXXXX")"
cid=''
cleanup() {
  if [[ -n "$cid" ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi
  rm -rf -- "$directory"
}
trap cleanup EXIT

# A transient GitHub Releases 504 must not permanently prevent signed images.
# If the download itself succeeds but the hash fails, NEVER switch sources:
# investigate the unexpected content instead of masking possible tampering.
if curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --retry 12 --retry-all-errors --retry-delay 2 --retry-max-time 240 \
    --connect-timeout 10 --max-time 40 "$release_url" -o "$directory/cosign.download"; then
  expected="$expected_release"
else
  echo 'GitHub Releases unavailable; checking immutable official GHCR Cosign OCI asset'
  docker pull --platform linux/amd64 "$oci_image" >/dev/null || {
    echo 'Pinned GHCR Cosign OCI download failed; image signing blocked' >&2
    exit 1
  }
  cid="$(docker create --platform linux/amd64 "$oci_image")"
  [[ "$cid" =~ ^[a-zA-Z0-9_-]{8,80}$ ]] || {
    echo 'Invalid temporary OCI container identity' >&2; exit 1;
  }
  docker cp "$cid:/ko-app/cosign" "$directory/cosign.download" >/dev/null
  docker rm -f "$cid" >/dev/null
  cid=''
  expected="$expected_oci"
fi

printf '%s  %s\n' "$expected" "$directory/cosign.download" | sha256sum -c - >/dev/null || {
  echo 'Pinned Cosign SHA256 mismatch; release signing blocked' >&2
  exit 1
}
mv -f -- "$directory/cosign.download" "$directory/cosign"
chmod 0755 "$directory/cosign"
"$directory/cosign" version --json >/dev/null

# Signing and keyless OIDC signature verification remain in the next step.
# Expose the binary only AFTER the exact source-specific SHA256 is confirmed.
printf '%s\n' "$directory" >> "$GITHUB_PATH"
trap - EXIT
echo 'Checksum-pinned Cosign v3.1.3 ready for mandatory signed image publication'
