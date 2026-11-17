#!/usr/bin/env bash
# Remove ONLY older SHA-tagged USD API/frontend images after a verified release.
# Caller holds the root deployment lock and supplies current + rollback SHAs.
set -Eeuo pipefail
[[ $# == 2 && "$1" =~ ^[a-f0-9]{40}$ && "$2" =~ ^[a-f0-9]{40}$ && "$1" != "$2" ]] || {
  echo "Expected distinct current and rollback commit SHAs" >&2
  exit 2
}
current="$1"
rollback="$2"
# Image removal is intentionally best-effort at the caller. Docker refuses
# removal of images still referenced by containers; never use --force.
failed=0
while IFS= read -r ref; do
  if [[ "$ref" =~ ^ghcr\.io/kolyagazha89/usd-2\.0-(api|frontend):([a-f0-9]{40})$ ]]; then
    tag="${BASH_REMATCH[2]}"
    if [[ "$tag" != "$current" && "$tag" != "$rollback" ]]; then
      if ! docker image rm -- "$ref"; then
        echo "Could not remove unused release image: $ref" >&2
        failed=1
      fi
    fi
  fi
done < <(docker image ls --format '{{.Repository}}:{{.Tag}}')
exit "$failed"
