#!/usr/bin/env bash
# Publish an immutable GHCR image with a trusted GitHub Actions identity.
# Rekor may reject a repeated, identical entry (409) on workflow re-runs;
# accepting it is safe ONLY if verification proves the image SHA, source SHA
# and this repository's main-branch OIDC identity.
set -Eeuo pipefail

: "${USD_IMAGE:?USD_IMAGE is required}"
: "${USD_DIGEST:?USD_DIGEST is required}"
: "${USD_SOURCE_SHA:?USD_SOURCE_SHA is required}"
[[ "$USD_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "Invalid immutable digest" >&2; exit 2; }
[[ "$USD_SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid source revision" >&2; exit 2; }
[[ "$USD_IMAGE" =~ ^ghcr\.io/kolyagazha89/usd-2\.0-(api|frontend)$ ]] || { echo "Unexpected image repository" >&2; exit 2; }
ref="$USD_IMAGE@$USD_DIGEST"
identity='https://github.com/kolyagazha89/Usd-2.0/.github/workflows/publish-home-pc-images.yml@refs/heads/main'

if ! sign_output="$(cosign sign --yes -a "git_sha=$USD_SOURCE_SHA" "$ref" 2>&1)"; then
  if [[ "$sign_output" != *"createLogEntryConflict"* || "$sign_output" != *"equivalent entry already exists"* ]]; then
    printf '%s\n' "$sign_output" >&2
    exit 1
  fi
  echo "Equivalent Rekor entry already exists; validating the published signature."
fi

# The verify MUST be executed even if signing returned an idempotent 409.
# A failure here blocks image publication and prevents the home VM from
# trusting an unverified/incorrect digest.
cosign verify --certificate-identity "$identity" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  -a "git_sha=$USD_SOURCE_SHA" "$ref" >/dev/null
echo "Verified signed image $ref for source $USD_SOURCE_SHA"
