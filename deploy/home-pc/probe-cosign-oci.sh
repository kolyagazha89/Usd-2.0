#!/usr/bin/env bash
# Read-only CI probe: resolve public official Cosign v3.1.3 OCI asset and
# hash its contents. NEVER execute this unreviewed binary or use it to sign.
set -Eeuo pipefail
umask 077
[[ "${GITHUB_ACTIONS:-}" == "true" && "$(uname -s)" == "Linux" ]] || exit 2
image=ghcr.io/sigstore/cosign/cosign:v3.1.3
tmp="$(mktemp -d)"
cid=''
cleanup() {
  if [[ -n "$cid" ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi
  rm -rf -- "$tmp"
}
trap cleanup EXIT
docker pull --platform linux/amd64 "$image" >/dev/null
resolved="$(docker image inspect --format '{{index .RepoDigests 0}}' "$image")"
[[ "$resolved" =~ ^ghcr\.io/sigstore/cosign/cosign@sha256:[a-f0-9]{64}$ ]] || {
  echo 'Unable to resolve immutable official OCI digest' >&2; exit 1;
}
cid="$(docker create --platform linux/amd64 "$image")"
docker cp "$cid:/ko-app/cosign" "$tmp/cosign" >/dev/null
[[ -s "$tmp/cosign" ]] || exit 1
printf 'COSIGN_OCI_REF=%s\n' "$resolved"
printf 'COSIGN_OCI_BINARY_SHA256=%s\n' "$(sha256sum "$tmp/cosign" | cut -d ' ' -f1)"
echo 'Read-only diagnostic: no signing, binary execution, or release approval'
