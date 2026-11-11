#!/usr/bin/env bash
# CI only: use the official, versioned static rclone binary rather than
# depending on an Ubuntu apt mirror for isolated backup transport fixtures.
set -Eeuo pipefail

readonly image='rclone/rclone:1.70.3'
temporary="$(mktemp -d)"
container_id=''
cleanup() {
  if [[ -n "$container_id" ]]; then
    docker rm "$container_id" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$temporary"
}
trap cleanup EXIT

# docker create never executes the upstream entrypoint. Only extract the binary.
container_id="$(docker create "$image" version)"
docker cp "$container_id:/usr/local/bin/rclone" "$temporary/rclone"
chmod 0755 "$temporary/rclone"
[[ "$("$temporary/rclone" version | head -n 1)" == 'rclone v1.70.3' ]] || {
  echo 'Unexpected rclone version in the CI transport image' >&2
  exit 1
}
sudo install -m 0755 "$temporary/rclone" /usr/local/bin/rclone
[[ "$(rclone version | head -n 1)" == 'rclone v1.70.3' ]]
