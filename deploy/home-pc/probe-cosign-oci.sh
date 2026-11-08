#!/usr/bin/env bash
# Read-only CI verification: resolve the official Sigstore OCI asset and
# verify its immutable manifest digest and independent binary SHA256.
# Never execute the extracted image or sign anything in this check.
set -Eeuo pipefail
umask 077
[[ "${GITHUB_ACTIONS:-}" == "true" && "$(uname -s)" == "Linux" ]] || exit 2
image=ghcr.io/sigstore/cosign/cosign:v3.1.3
pinned=ghcr.io/sigstore/cosign/cosign@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8
expected=a57926e24b07f02b5baf3be81f9a5988e9e45d8a1ca8ca500cdf56d10e69f887
tmp="$(mktemp -d)"
cid=''
cleanup() {
  if [[ -n "$cid" ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi
  rm -rf -- "$tmp"
}
trap cleanup EXIT
docker pull --platform linux/amd64 "$image" >/dev/null
resolved="$(docker image inspect --format '{{index .RepoDigests 0}}' "$image")"
[[ "$resolved" == "$pinned" ]] || {
  echo 'Unable to resolve immutable official OCI digest' >&2; exit 1;
}
cid="$(docker create --platform linux/amd64 "$pinned")"
docker cp "$cid:/ko-app/cosign" "$tmp/cosign" >/dev/null
[[ -s "$tmp/cosign" ]] || exit 1
checksum="$(sha256sum "$tmp/cosign" | cut -d ' ' -f1)"
[[ "$checksum" == "$expected" ]] || { echo 'Official OCI binary SHA256 mismatch; refusing fallback' >&2; exit 1; }
echo 'Pinned official GHCR Cosign OCI digest and independent binary SHA256 verified; no signing, execution or release approval'
