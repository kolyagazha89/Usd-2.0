#!/usr/bin/env bash
# Only used on a newly unpacked, checksum-verified ROOT-owned runner archive.
set -Eeuo pipefail
[[ "$(id -u)" == 0 && $# == 1 ]] || exit 2
runner="$1"
for file in "$runner" "$runner/bin" "$runner/bin/runsvc.sh"; do
  [[ -e "$file" && ! -L "$file" && "$(stat -c %u "$file")" == 0 ]] &&
    (( (8#$(stat -c %a "$file") & 022) == 0 )) || { echo 'Runner archive is not root-controlled' >&2; exit 1; }
done
[[ ! -L "$runner/runsvc.sh" ]] || { echo 'Refusing a symlinked runner launcher' >&2; exit 1; }
install -o root -g root -m 0755 "$runner/bin/runsvc.sh" "$runner/runsvc.sh"
