#!/usr/bin/env bash
# Installs inert, root-owned USD build/release helpers. Does NOT enable the timer.
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] || { echo "Run as root" >&2; exit 1; }
# Deliberate operator-only recovery. The normal installer NEVER edits the
# failed-release quarantine; this option may authorize one protected retry
# after the trusted schema pin repair. No database/containers are modified.
review_retry=0
if (( $# )); then
  [[ $# == 1 && "$1" == "--review-quarantined-schema-release" ]] ||
    { echo "Usage: install-local-deployer.sh [--review-quarantined-schema-release]" >&2; exit 2; }
  review_retry=1
fi
# Installing reviewed scripts and Compose snapshots while a release is running
# can replace the trust boundary between validation and docker compose up.
# Serialize installer, local builder and release under the same host lock.
exec 9>/run/lock/usd-home-deploy.lock
flock -n 9 || { echo "USD deployment is active; installer must retry later" >&2; exit 75; }
cd "$(dirname "$(realpath "$0")")"
for tool in git docker flock systemctl install bash awk df python3 cmp readlink; do
  command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }
done
docker compose version >/dev/null
for script in auto-deploy.sh release-approved.sh rehearse-schema-on-backup.sh verify-media-backup.sh verify-db-offsite-backup.sh setup-home-pc.sh prepare-runner-launcher.sh test-release.sh test-auto-deploy.sh; do bash -n "$script"; done
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("verify-main-ci.py").read_text())'
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("initial-schema.py").read_text())'
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("safe-schema-migration.py").read_text())'
python3 test-safe-schema-migration.py -v
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("verify-prerelease.py").read_text())'
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("prepare-host-files.py").read_text())'
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("s3/verify-local-hdd-snapshot.py").read_text())'
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("verify-second-disk-db-backup.py").read_text())'
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("verify-second-disk-media-backup.py").read_text())'
python3 test-second-disk-db-backup.py -v
python3 test-second-disk-media-backup.py -v
bash install-cosign.sh
install -d -o root -g root -m 0755 /usr/local/libexec
install -o root -g root -m 0755 verify-image-signature.py /usr/local/libexec/usd-verify-image-signature
install -o root -g root -m 0755 verify-main-ci.py /usr/local/libexec/usd-verify-main-ci
install -o root -g root -m 0750 initial-schema.py /usr/local/libexec/usd-initial-schema
install -o root -g root -m 0750 safe-schema-migration.py /usr/local/libexec/usd-safe-schema-migration
install -o root -g root -m 0755 verify-prerelease.py /usr/local/libexec/usd-verify-prerelease
install -o root -g root -m 0750 rehearse-schema-on-backup.sh /usr/local/libexec/usd-rehearse-schema-on-backup
install -o root -g root -m 0750 verify-media-backup.sh /usr/local/libexec/usd-verify-media-backup
install -o root -g root -m 0750 verify-db-offsite-backup.sh /usr/local/libexec/usd-verify-db-offsite-backup
install -o root -g root -m 0750 s3/verify-local-hdd-snapshot.py /usr/local/libexec/usd-verify-local-hdd-snapshot
install -o root -g root -m 0750 verify-second-disk-db-backup.py /usr/local/libexec/usd-verify-second-disk-db-backup
install -o root -g root -m 0750 verify-second-disk-media-backup.py /usr/local/libexec/usd-verify-second-disk-media-backup
# Docker Compose runs as root through the release helper. Never execute a
# Compose YAML directly from the usd-owned checkout during an automatic release.
install -d -o root -g root -m 0755 /etc/usd-deployer/compose
for config in compose.yaml compose.local.yaml; do
  install -o root -g root -m 0644 "$config" "/etc/usd-deployer/compose/$config"
done
install -d -o root -g root -m 0700 /var/lib/usd-deployer
# Bootstrap the original explicitly approved schema from the legacy /etc pin
# exactly once. NEVER re-copy it after a verified migration advanced the pin.
LEGACY_PIN=/etc/usd-auto-release-schema
PIN=/var/lib/usd-deployer/schema-pin
if [[ ! -e "$PIN" && ! -L "$PIN" && -f "$LEGACY_PIN" ]]; then
  [[ ! -L "$LEGACY_PIN" && "$(stat -c %u "$LEGACY_PIN")" == 0 ]] &&
    (( (8#$(stat -c %a "$LEGACY_PIN") & 077) == 0 )) ||
    { echo "Unsafe legacy schema pin; refusing bootstrap" >&2; exit 1; }
  schema_tree="$(cat "$LEGACY_PIN")"
  [[ "$schema_tree" =~ ^[0-9a-f]{40}$ ]] ||
    { echo "Invalid legacy schema tree; refusing bootstrap" >&2; exit 1; }
  temporary_pin="$(mktemp /var/lib/usd-deployer/.schema-pin.XXXXXXXX)"
  printf '%s\n' "$schema_tree" > "$temporary_pin"
  chmod 0600 "$temporary_pin"
  mv -f "$temporary_pin" "$PIN"
  echo "Trusted legacy schema pin copied into root-only StateDirectory (once)"
fi
if [[ -e "$PIN" || -L "$PIN" ]]; then
  [[ -f "$PIN" && ! -L "$PIN" && "$(stat -c %u "$PIN")" == 0 ]] &&
    (( (8#$(stat -c %a "$PIN") & 077) == 0 )) &&
    [[ "$(cat "$PIN")" =~ ^[0-9a-f]{40}$ ]] ||
    { echo "Unsafe schema pin; installation refused" >&2; exit 1; }
fi
install -o root -g root -m 0750 auto-deploy.sh /usr/local/sbin/usd-auto-deploy
install -o root -g root -m 0750 release-approved.sh /usr/local/sbin/usd-release-approved
install -o root -g root -m 0644 usd-auto-deploy.service /etc/systemd/system/usd-auto-deploy.service
install -o root -g root -m 0644 usd-auto-deploy.timer /etc/systemd/system/usd-auto-deploy.timer
systemctl daemon-reload
if [[ "$review_retry" == 1 ]]; then
  # Retry is permitted ONLY when the exact currently reviewed main commit
  # failed while the original operator-approved schema pin remained frozen.
  # An audit copy of the quarantine is retained. All root CI / digest /
  # backup / restore and live-history gates will execute again in the service.
  marker=/var/lib/usd-deployer/failed-release-sha
  if [[ ! -e "$marker" && ! -L "$marker" ]]; then
    echo "No quarantined SHA: normal CI-gated release remains available."
  else
  [[ -f "$marker" && ! -L "$marker" && "$(stat -c %u "$marker")" == 0 ]] &&
    (( (8#$(stat -c %a "$marker") & 077) == 0 )) ||
    { echo "No trusted quarantined release marker for supervised recovery" >&2; exit 1; }
  failed_sha="$(cat "$marker")"
  [[ "$failed_sha" =~ ^[0-9a-f]{40}$ ]] ||
    { echo "Invalid quarantined release identity" >&2; exit 1; }
  repo_root="$(git rev-parse --show-toplevel)"
  case "$(git -C "$repo_root" remote get-url origin)" in
    https://github.com/kolyagazha89/Usd-2.0|https://github.com/kolyagazha89/Usd-2.0.git) ;;
    *) echo "Untrusted repository remote for supervised retry" >&2; exit 1 ;;
  esac
  [[ "$(git -C "$repo_root" rev-parse --abbrev-ref HEAD)" == main ]] ||
    { echo "Supervised retry requires the local main branch" >&2; exit 1; }
  local_main="$(git -C "$repo_root" rev-parse HEAD)"
  remote_main="$(git -C "$repo_root" ls-remote --exit-code origin refs/heads/main)" ||
    { echo "Cannot verify latest main for supervised retry" >&2; exit 1; }
  remote_sha="$(awk '$2 == "refs/heads/main" {print $1}' <<< "$remote_main")"
  [[ "$remote_sha" == "$local_main" ]] ||
    { echo "Pull and review latest main before supervising a release" >&2; exit 1; }
  # A previous root-owned pin may be immutable on ext4. That makes
  # os.replace() fail AFTER Prisma history and the full restore passed.
  # Repair only on this explicitly requested supervised recovery path, never
  # in the timer, and only while the original approved pin is unchanged.
  command -v lsattr >/dev/null || { echo 'Cannot inspect schema pin filesystem attributes' >&2; exit 1; }
  pin_flags="$(lsattr -d "$PIN" 2>/dev/null)" ||
    { echo 'Cannot inspect schema pin filesystem attributes' >&2; exit 1; }
  pin_flags="${pin_flags%% *}"
  if [[ "$pin_flags" == *i* ]]; then
    [[ -f "$LEGACY_PIN" && ! -L "$LEGACY_PIN" && "$(stat -c %u "$LEGACY_PIN")" == 0 ]] &&
      (( (8#$(stat -c %a "$LEGACY_PIN") & 077) == 0 )) &&
      cmp -s "$PIN" "$LEGACY_PIN" ||
      { echo 'Immutable schema pin differs from initial approved baseline; manual review required' >&2; exit 1; }
    command -v chattr >/dev/null || { echo 'Cannot repair immutable pin: chattr missing' >&2; exit 1; }
    chattr -i "$PIN" || { echo 'Cannot clear immutable flag on reviewed schema pin' >&2; exit 1; }
    new_flags="$(lsattr -d "$PIN" 2>/dev/null)" ||
      { echo 'Cannot recheck schema pin filesystem attributes' >&2; exit 1; }
    new_flags="${new_flags%% *}"
    [[ "$new_flags" != *i* ]] && cmp -s "$PIN" "$LEGACY_PIN" ||
      { echo 'Reviewed schema pin cannot be made writable without changing content' >&2; exit 1; }
    install -o root -g root -m 0600 /dev/null "/var/lib/usd-deployer/reviewed-immutable-schema-pin-$failed_sha"
    echo 'Reviewed immutable schema pin unlocked for the existing CI/backup/restore gates.'
  fi
  if [[ "$failed_sha" != "$local_main" ]]; then
    # The old failed SHA is already excluded from an entirely new main
    # release. Retain its quarantine audit marker without bypassing anything.
    echo "Previous failed SHA remains quarantined; current main differs and is eligible for normal fully gated deployment."
  else
    [[ -f "$LEGACY_PIN" && ! -L "$LEGACY_PIN" && "$(stat -c %u "$LEGACY_PIN")" == 0 ]] &&
      (( (8#$(stat -c %a "$LEGACY_PIN") & 077) == 0 )) &&
      cmp -s "$PIN" "$LEGACY_PIN" ||
      { echo "Schema pin already changed or lost original approval; manual review required" >&2; exit 1; }
    reviewed_marker="/var/lib/usd-deployer/reviewed-failed-release-$failed_sha"
    [[ ! -e "$reviewed_marker" && ! -L "$reviewed_marker" ]] ||
      { echo "This quarantined release was already reviewed once; no automatic repeat" >&2; exit 1; }
    mv -T -- "$marker" "$reviewed_marker"
    echo "One supervised retry authorized for reviewed SHA; quarantine retained for audit."
    echo "The CI, signed-image, PostgreSQL backup/restore, Prisma history and public checks are still required."
  fi
  fi
fi
echo "USD helpers installed but NOT enabled. No production containers or DB changed."
echo "Do not enable until the supervised build and rollback test is approved."
