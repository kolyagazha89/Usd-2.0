#!/usr/bin/env bash
# Manual, explicitly approved release of prebuilt images. No migrations or DB restart.
set -Eeuo pipefail
umask 077
# The automatic builder passes its already-locked FD 9. Reuse that exact
# descriptor so no second deployer can slip in during the handoff. Direct
# supervised invocations still acquire the lock independently.
if [[ "${USD_DEPLOY_LOCK_HELD:-0}" == 1 ]]; then
  [[ "$(readlink /proc/self/fd/9 2>/dev/null)" == /run/lock/usd-home-deploy.lock ]] ||
    { echo "Missing trusted inherited deploy lock descriptor" >&2; exit 75; }
else
  exec 9>/run/lock/usd-home-deploy.lock
fi
flock -n 9 || { echo "Another USD build/release is running; retry later" >&2; exit 75; }

DEPLOY_DIR=/home/usd/usd-deploy/deploy/home-pc
TRUSTED_DIR=/etc/usd-deployer/compose
# The first USD stack was created from usd-src, before the deploy worktree.
LEGACY_DIR=/home/usd/usd-src/deploy/home-pc
LEGACY_BASELINE=e8b5b0f22780a61e79765b8fd92167e241df82a2
STATE_DIR=/var/lib/usd-deployer
PROJECT=usd-home
NEW_TAG="${1:-}"
[[ "$NEW_TAG" =~ ^[a-f0-9]{40}$ ]] || { echo "Usage: release-approved.sh <full Git SHA>" >&2; exit 2; }
preflight_only=0
local_hdd_snapshot=''
shift
while (( $# )); do
  case "$1" in
    --preflight-only)
      [[ "$preflight_only" == 0 ]] || exit 2
      preflight_only=1; shift ;;
    --local-hdd-snapshot)
      [[ -z "$local_hdd_snapshot" && $# -ge 2 ]] || exit 2
      local_hdd_snapshot="$2"; shift 2 ;;
    *) echo 'Usage: release-approved.sh SHA [--preflight-only] [--local-hdd-snapshot PATH]' >&2; exit 2 ;;
  esac
done
if [[ -n "$local_hdd_snapshot" ]]; then
  # Explicit, supervised local-risk prerelease ONLY. The normal automated
  # release still requires a truly independent off-host DB/media backup.
  [[ "${USD_ACCEPT_SAME_HOST_BACKUP:-0}" == 1 &&
     "${USD_DEPLOY_LOCK_HELD:-0}" == 1 &&
     ! -e /etc/usd-deploy-enabled ]] ||
    { echo 'Local-HDD prerelease needs operator consent, inherited lock and disabled auto-deploy' >&2; exit 1; }
  [[ -x /usr/local/libexec/usd-verify-local-hdd-snapshot ]] ||
    { echo 'Trusted local HDD snapshot verifier not installed' >&2; exit 1; }
  /usr/local/libexec/usd-verify-local-hdd-snapshot "$local_hdd_snapshot"
  echo 'WARNING: backup on same Windows PC is NOT offsite. Manual prerelease only.'
fi

# Approval state is a privileged trust boundary, not merely a cache. A
# group-writable state directory or built-SHA file could authorize an image
# which the root-owned local builder never produced.
[[ -d "$STATE_DIR" && ! -L "$STATE_DIR" && "$(stat -c %u "$STATE_DIR")" == 0 ]] ||
  { echo "Untrusted release state directory" >&2; exit 1; }
(( (8#$(stat -c %a "$STATE_DIR") & 022) == 0 )) ||
  { echo "Release state directory must not be group/world writable" >&2; exit 1; }

# Approval files must be root-owned and contain the exact SHA, not just exist.
approved_sha() {
  local file="$1"
  [[ -f "$file" && ! -L "$file" && "$(stat -c %u "$file")" == 0 ]] &&
    (( (8#$(stat -c %a "$file") & 022) == 0 )) &&
    [[ "$(cat "$file")" == "$NEW_TAG" ]]
}
approval_file="$STATE_DIR/release-approved-sha"
if ! approved_sha "$approval_file"; then approval_file=/etc/usd-release-approved; fi
approved_sha "$approval_file" || { echo "Root-owned release approval for this SHA missing" >&2; exit 1; }
approved_sha "$STATE_DIR/schema-approved-sha" || { echo "Schema compatibility not approved for this SHA" >&2; exit 1; }
approved_sha "$STATE_DIR/built-sha" ||
  { echo "Requested SHA was not built locally or its build marker is untrusted" >&2; exit 1; }

# Public acceptance is part of this transaction, not a later CI observation.
# Refuse an untrusted executable before taking backups or replacing images.
PUBLIC_VERIFIER=/usr/local/libexec/usd-verify-prerelease
[[ -f "$PUBLIC_VERIFIER" && -x "$PUBLIC_VERIFIER" && ! -L "$PUBLIC_VERIFIER" &&
   "$(stat -c %u "$PUBLIC_VERIFIER")" == 0 ]] &&
  (( (8#$(stat -c %a "$PUBLIC_VERIFIER") & 022) == 0 )) ||
  { echo "Untrusted public prerelease verifier" >&2; exit 1; }

cd "$DEPLOY_DIR"
[[ -f .env && ! -L .env ]] || { echo "Missing or symlinked production .env" >&2; exit 1; }
(( (8#$(stat -c %a .env) & 077) == 0 )) ||
  { echo "Production .env must not be accessible to group or other users" >&2; exit 1; }
if grep -Eq '^[[:space:]]*([A-Za-z_]*TUNNEL_TOKEN)[[:space:]]*=' .env; then
  echo "Unsupported ingress token in application environment" >&2
  exit 1
fi
OLD_TAG="$(sed -n -E 's/^USD_IMAGE_TAG=([a-f0-9]{40})$/\1/p' .env)"
[[ "$OLD_TAG" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid or duplicated USD_IMAGE_TAG" >&2; exit 1; }
[[ "$OLD_TAG" != "$NEW_TAG" ]] || { echo "Already at requested SHA"; exit 0; }

# The backup below covers the local usd-home PostgreSQL service. Never
# authorize an API release against a different DB (or the primary website):
# a successful local pg_dump would otherwise protect the WRONG database.
# Parse without sourcing .env, expanding shell code, or printing secrets.
python3 - .env <<'PY'
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

critical = {"APP_DOMAIN", "API_DOMAIN", "POSTGRES_DB", "POSTGRES_USER",
            "POSTGRES_PASSWORD", "DATABASE_URL"}
values = {}
try:
    for raw in Path(sys.argv[1]).read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, val = line.partition("=")
        key = key.strip()
        if key not in critical:
            continue
        if not sep or key in values:
            raise ValueError("duplicate or malformed deployment setting")
        val = val.strip()
        if val.startswith(('"', "'")):
            if len(val) < 2 or val[-1] != val[0]:
                raise ValueError("unclosed quoted setting")
            val = val[1:-1]
        else:
            val = re.sub(r"\s+#.*$", "", val).strip()
        if not val or "${" in val:
            raise ValueError("missing or interpolated deployment setting")
        values[key] = val
    if values.keys() != critical:
        raise ValueError("missing deployment setting")
    if values["APP_DOMAIN"] != "app.usd-russia.ru" or values["API_DOMAIN"] != "api.usd-russia.ru":
        raise ValueError("deployment targets are not the approved prerelease domains")
    db = urlsplit(values["DATABASE_URL"])
    # pg-connection-string/Prisma can interpret query parameters as connection
    # overrides. A URL whose authority says db:5432 can still select another
    # host/database via ?host=, ?hostaddr=, ?database=, etc. The release backup
    # protects ONLY the local Compose DB; accept the documented Prisma schema
    # parameter and no other connection options (including duplicates).
    params = parse_qsl(db.query, keep_blank_values=True, strict_parsing=True)
    if params not in ([], [("schema", "public")]):
        raise ValueError("unsafe PostgreSQL connection query parameters")
    if (db.scheme not in ("postgres", "postgresql") or db.hostname != "db" or db.port != 5432
            or unquote(db.username or "") != values["POSTGRES_USER"]
            or unquote(db.password or "") != values["POSTGRES_PASSWORD"]
            or unquote(db.path) != "/" + values["POSTGRES_DB"]
            or db.fragment):
        raise ValueError("application database does not match local PostgreSQL backup target")
except (OSError, ValueError, KeyError, IndexError) as exc:
    print(f"Unsafe deployment environment: {exc}", file=sys.stderr)
    sys.exit(1)
PY

# Docker Compose gives exported process variables precedence over --env-file.
# An inherited DATABASE_URL/APP_DOMAIN/USD_IMAGE_TAG could silently bypass
# the validated backup target, prerelease domain or immutable image tag.
# Refuse such invocations instead of relying on the caller's shell state.
for inherited in APP_DOMAIN API_DOMAIN POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD \
  DATABASE_URL USD_IMAGE_TAG COMPOSE_FILE COMPOSE_PROFILES COMPOSE_PROJECT_NAME \
  COMPOSE_ENV_FILES COMPOSE_DISABLE_ENV_FILE DOCKER_HOST DOCKER_CONTEXT; do
  if [[ -v "$inherited" ]]; then
    echo "Unsafe inherited Compose/Docker override: $inherited" >&2
    exit 1
  fi
done

for service in api frontend; do
  for tag in "$OLD_TAG" "$NEW_TAG"; do
    docker image inspect "ghcr.io/kolyagazha89/usd-2.0-$service:$tag" >/dev/null ||
      { echo "Image missing for $service:$tag (rollback must be possible)" >&2; exit 1; }
  done
done

# Authenticate both candidate digests before any backup, rehearsal or switch.
# Existing deployed images remain the supervised rollback baseline; old unsigned
# releases are never reintroduced as a new automatic candidate.
IMAGE_VERIFIER=/usr/local/libexec/usd-verify-image-signature
[[ -f "$IMAGE_VERIFIER" && -x "$IMAGE_VERIFIER" && ! -L "$IMAGE_VERIFIER" &&
   "$(stat -c %u "$IMAGE_VERIFIER")" == 0 ]] &&
  (( (8#$(stat -c %a "$IMAGE_VERIFIER") & 022) == 0 )) ||
  { echo 'Missing or untrusted image signature verifier' >&2; exit 1; }
new_api_id="$("$IMAGE_VERIFIER" api "$NEW_TAG" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')" ||
  { echo 'Candidate API signature not verified' >&2; exit 1; }
new_frontend_id="$("$IMAGE_VERIFIER" frontend "$NEW_TAG" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')" ||
  { echo 'Candidate frontend signature not verified' >&2; exit 1; }
[[ "$new_api_id" =~ ^sha256:[a-f0-9]{64}$ && "$new_frontend_id" =~ ^sha256:[a-f0-9]{64}$ ]] ||
  { echo 'Invalid verified candidate image identity' >&2; exit 1; }

# Use the *exact* Compose overlays used by the running API, including the tunnel
# overlay if present. Reject unfamiliar files rather than accidentally replacing
# a container with an incomplete or different configuration.
api_id="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=api")"
front_id="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=frontend")"
[[ -n "$api_id" && -n "$front_id" && "$api_id" != *$'\n'* && "$front_id" != *$'\n'* ]] ||
  { echo "Expected exactly one running API and frontend" >&2; exit 1; }
[[ "$(docker inspect -f '{{.Config.Image}}' "$api_id")" == "ghcr.io/kolyagazha89/usd-2.0-api:$OLD_TAG" &&
   "$(docker inspect -f '{{.Config.Image}}' "$front_id")" == "ghcr.io/kolyagazha89/usd-2.0-frontend:$OLD_TAG" ]] ||
  { echo "Running images do not match the deployment environment; refusing an unverified rollback target" >&2; exit 1; }
old_api_id="$(docker inspect -f '{{.Image}}' "$api_id")"
old_frontend_id="$(docker inspect -f '{{.Image}}' "$front_id")"
[[ "$old_api_id" =~ ^sha256:[a-f0-9]{64}$ && "$old_frontend_id" =~ ^sha256:[a-f0-9]{64}$ ]] ||
  { echo 'Invalid running rollback image identity' >&2; exit 1; }
for service in api frontend; do
  baseline_id="$old_api_id"
  [[ "$service" == api ]] || baseline_id="$old_frontend_id"
  [[ "$(docker image inspect --format '{{.Id}}' "ghcr.io/kolyagazha89/usd-2.0-$service:$OLD_TAG")" == "$baseline_id" ]] ||
    { echo 'Rollback tag does not identify the currently running image' >&2; exit 1; }
done
api_files="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$api_id")"
front_files="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$front_id")"
[[ -n "$api_files" && "$api_files" == "$front_files" ]] ||
  { echo "API and frontend use different Compose files" >&2; exit 1; }
IFS=',' read -r -a active_files <<< "$api_files"
compose_args=()
has_base=0
[[ -d "$TRUSTED_DIR" && ! -L "$TRUSTED_DIR" && "$(stat -c %u "$TRUSTED_DIR")" == 0 ]] ||
  { echo "Missing or untrusted root-owned Compose directory" >&2; exit 1; }
(( (8#$(stat -c %a "$TRUSTED_DIR") & 022) == 0 )) ||
  { echo "Trusted Compose directory must not be group/world writable" >&2; exit 1; }
for file in "${active_files[@]}"; do
  case "$file" in
    "$DEPLOY_DIR/compose.yaml"|"$TRUSTED_DIR/compose.yaml") has_base=1 ;;
    "$DEPLOY_DIR/compose.local.yaml"|"$TRUSTED_DIR/compose.local.yaml") ;;
    "$LEGACY_DIR/compose.yaml")
      [[ -n "$local_hdd_snapshot" ]] ||
        { echo "Legacy Compose requires supervised local-HDD release" >&2; exit 1; }
      has_base=1 ;;
    "$LEGACY_DIR/compose.local.yaml")
      [[ -n "$local_hdd_snapshot" ]] ||
        { echo "Legacy overlay requires supervised local-HDD release" >&2; exit 1; } ;;
    *) echo "Unknown active Compose file: $file" >&2; exit 1 ;;
  esac
  [[ -f "$file" && ! -L "$file" ]] ||
    { echo "Compose file missing or symlinked: $file" >&2; exit 1; }
  trusted_file="$TRUSTED_DIR/${file##*/}"
  [[ -f "$trusted_file" && ! -L "$trusted_file" && "$(stat -c %u "$trusted_file")" == 0 ]] ||
    { echo "Missing or untrusted root-owned Compose snapshot: $trusted_file" >&2; exit 1; }
  (( (8#$(stat -c %a "$trusted_file") & 022) == 0 )) ||
    { echo "Compose snapshot is group/world writable: $trusted_file" >&2; exit 1; }
  if [[ "$file" == "$LEGACY_DIR/"* ]]; then
    # Only accept an exact known layout with comments omitted. The old
    # user-writable file is NEVER passed to Docker Compose; only the trusted
    # root-owned reviewed candidate is used to recreate API/frontend.
    python3 - "$file" "$trusted_file" "$LEGACY_BASELINE" <<'PY'
from pathlib import Path
import subprocess
import sys

actual, trusted = map(Path, sys.argv[1:3])
baseline = sys.argv[3]

def significant(raw):
    return tuple(line.rstrip() for line in raw.decode('utf-8').splitlines()
                 if line.strip() and not line.lstrip().startswith('#'))

old = subprocess.run(
    ['git', '-C', '/opt/usd-release-source', 'show',
     f'{baseline}:deploy/home-pc/{actual.name}'],
    capture_output=True, check=False)
allowed = [significant(trusted.read_bytes())]
if old.returncode == 0:
    allowed.append(significant(old.stdout))
if significant(actual.read_bytes()) not in allowed:
    raise SystemExit('Legacy running Compose differs from trusted or historical baseline; refusing: ' + str(actual))
print('Verified legacy Compose origin:', actual)
PY
  else
    cmp -s "$file" "$trusted_file" ||
      { echo "Running Compose config differs from reviewed root-owned snapshot: $file" >&2; exit 1; }
  fi
  compose_args+=(-f "$trusted_file")
done
[[ "$has_base" == 1 ]] || { echo "Base Compose file absent" >&2; exit 1; }
db_before="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=db")"
[[ -n "$db_before" && "$db_before" != *$'\n'* ]] ||
  { echo "Expected exactly one running production DB" >&2; exit 1; }
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$db_before")" == healthy ]] ||
  { echo "Production DB is not healthy; refusing release" >&2; exit 1; }

# The .env file may have been edited since the current containers started.
# A healthy API could still be connected to an external PostgreSQL instance:
# dumping the local db would then protect the WRONG participant records.
# Verify the actual running container environments, without printing secrets,
# before considering either the existing deployment or its backup trustworthy.
python3 - "$DEPLOY_DIR/.env" "$api_id" "$db_before" <<'PY'
import json
import re
import subprocess
import sys
from pathlib import Path

def expected_env(path):
    required = {"DATABASE_URL", "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"}
    found = {}
    for raw in Path(path).read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        key = key.strip()
        if key not in required:
            continue
        if not sep or key in found:
            raise ValueError("duplicate or malformed DB setting")
        value = value.strip()
        if value.startswith(('"', "'")):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError("unclosed DB setting")
            value = value[1:-1]
        else:
            value = re.sub(r"\s+#.*$", "", value).strip()
        found[key] = value
    if found.keys() != required:
        raise ValueError("missing DB setting")
    return found

def container_env(container_id):
    output = subprocess.run(
        ["docker", "inspect", "--format", "{{json .Config.Env}}", container_id],
        check=True, capture_output=True, text=True,
    ).stdout
    entries = json.loads(output)
    if not isinstance(entries, list):
        raise ValueError("invalid Docker environment")
    result = {}
    for entry in entries:
        if not isinstance(entry, str) or "=" not in entry:
            raise ValueError("invalid Docker environment entry")
        key, value = entry.split("=", 1)
        if key in result:
            raise ValueError("duplicate Docker environment entry")
        result[key] = value
    return result

try:
    expected = expected_env(sys.argv[1])
    api = container_env(sys.argv[2])
    db = container_env(sys.argv[3])
    api_checks = {
        "DATABASE_URL": expected["DATABASE_URL"],
        "NODE_ENV": "production",
        "AUTH_COOKIE_SECURE": "true",
        "FRONTEND_URL": "https://app.usd-russia.ru",
        "CORS_ORIGINS": "https://app.usd-russia.ru",
        "CSRF_TRUSTED_ORIGINS": "https://app.usd-russia.ru",
        "API_PUBLIC_URL": "https://api.usd-russia.ru",
        "PUBLIC_API_URL": "https://api.usd-russia.ru",
    }
    db_checks = {key: expected[key] for key in ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD")}
    if any(api.get(key) != value for key, value in api_checks.items()):
        raise ValueError("running API environment drift")
    if any(db.get(key) != value for key, value in db_checks.items()):
        raise ValueError("running PostgreSQL environment drift")
except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
    # Never include the actual values, which may contain database credentials.
    print(f"Running API/DB configuration does not match approved prerelease backup target: {type(exc).__name__}", file=sys.stderr)
    sys.exit(1)
PY

# Use a private, unique rollback snapshot. Preserve original ownership and mode.
mkdir -p "$STATE_DIR"
backup="$(mktemp "$STATE_DIR/release-env.XXXXXXXX")"
cp -p .env "$backup"
changed=0
db_snapshot_tmp=''
tmp=''
# HTTP readiness alone can pass against a stale container if Compose did not
# actually switch images. Require exactly one running container per service and
# verify its immutable image tag before declaring release or rollback healthy.
verify_running_images() {
  local expected="$1" service ids running_image
  for service in api frontend; do
    ids="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=$service")"
    [[ -n "$ids" && "$(echo "$ids" | wc -l)" -eq 1 ]] || return 1
    running_image="$(docker inspect -f '{{.Config.Image}}' "$ids")" || return 1
    [[ "$running_image" == "ghcr.io/kolyagazha89/usd-2.0-$service:$expected" ]] || return 1
    local verified_id="$old_api_id"
    [[ "$service" == api ]] || verified_id="$old_frontend_id"
    if [[ "$expected" == "$NEW_TAG" ]]; then
      verified_id="$new_api_id"
      [[ "$service" == api ]] || verified_id="$new_frontend_id"
    fi
    [[ "$(docker inspect -f '{{.Image}}' "$ids")" == "$verified_id" ]] || return 1
  done
}
# A static HTTP 200 is not enough: the API can serve its root endpoint
# while its database credentials, DNS or network connection are broken.
# Probe PostgreSQL from INSIDE the running API image using its actual
# DATABASE_URL. This does not mutate data or run migrations.
api_database_ready() {
  docker compose --project-name "$PROJECT" --project-directory "$DEPLOY_DIR" --env-file .env "${compose_args[@]}" exec -T api node -e \
    'const {Client}=require("pg");const c=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000,query_timeout:3000});(async()=>{try{await c.connect();await c.query("SELECT 1");}finally{await c.end().catch(()=>{});}})().catch(()=>{process.exitCode=1;})' \
    >/dev/null 2>&1
}
wait_ready() {
  local attempt api_ok frontend_ok
  for attempt in $(seq 1 "${1:-30}"); do
    api_ok=0
    frontend_ok=0
    docker compose --project-name "$PROJECT" --project-directory "$DEPLOY_DIR" --env-file .env "${compose_args[@]}" exec -T api node -e \
      "fetch('http://127.0.0.1:3000/',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1 && api_ok=1
    docker compose --project-name "$PROJECT" --project-directory "$DEPLOY_DIR" --env-file .env "${compose_args[@]}" exec -T frontend \
      wget -T 5 -q -O /dev/null http://127.0.0.1/index.html >/dev/null 2>&1 && frontend_ok=1
    if [[ "$api_ok" == 1 && "$frontend_ok" == 1 ]] && api_database_ready; then return 0; fi
    sleep 4
  done
  return 1
}
rollback() {
  local status="${1:-$?}"
  trap - ERR TERM INT
  # Never destroy the only saved original configuration if rollback cannot
  # restore it. The snapshot is private (mktemp under root-owned STATE_DIR).
  local env_restored=1
  if [[ "$changed" == 1 ]]; then
    echo "Release failed (exit $status); restoring previous images" >&2
    # Restore via a private file on the SAME filesystem as .env. A direct
    # cp into .env could truncate the active config if the host runs out of
    # space or is interrupted midway through rollback.
    restore_tmp=''
    if ! restore_tmp="$(mktemp "$DEPLOY_DIR/.env.rollback.XXXXXXXX")" ||
       ! cp -p "$backup" "$restore_tmp" ||
       ! mv -f "$restore_tmp" .env; then
      [[ -z "$restore_tmp" ]] || rm -f -- "$restore_tmp"
      env_restored=0
      echo "CRITICAL: could not restore previous production .env; manual intervention required" >&2
    # Restore the rollback tags from the captured running image IDs, rather
    # than trusting tags that another local image operation may have changed.
    elif ! docker image tag "$old_api_id" "ghcr.io/kolyagazha89/usd-2.0-api:$OLD_TAG" ||
         ! docker image tag "$old_frontend_id" "ghcr.io/kolyagazha89/usd-2.0-frontend:$OLD_TAG"; then
      echo "CRITICAL: original rollback image identities are unavailable; manual intervention required" >&2
    elif ! docker compose --project-name "$PROJECT" --project-directory "$DEPLOY_DIR" --env-file .env "${compose_args[@]}" up -d --pull never --no-deps api frontend; then
      echo "CRITICAL: automatic image rollback failed; manual intervention required" >&2
    elif ! wait_ready; then
      echo "CRITICAL: previous API/frontend failed readiness after rollback; manual intervention required" >&2
    elif ! verify_running_images "$OLD_TAG"; then
      echo "CRITICAL: previous API/frontend image tags do not match rollback target; manual intervention required" >&2
    elif [[ "$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=db")" != "$db_before" ]]; then
      echo "CRITICAL: production DB container changed during application rollback; manual intervention required" >&2
    elif [[ "$(docker inspect -f '{{.State.Health.Status}}' "$db_before" 2>/dev/null)" != healthy ]]; then
      echo "CRITICAL: production DB is unhealthy after application rollback; manual intervention required" >&2
    else
      echo "Previous API/frontend passed readiness after rollback" >&2
    fi
  fi
  if [[ "$env_restored" == 1 ]]; then
    rm -f -- "$backup"
  else
    echo "CRITICAL: original .env retained at $backup (private root-only file); restore it manually before any further release" >&2
  fi
  [[ -z "$db_snapshot_tmp" ]] || rm -f -- "$db_snapshot_tmp"
  # A failed Compose validation must not leave a private .env copy behind.
  [[ -z "$tmp" ]] || rm -f -- "$tmp"
  exit "$status"
}
trap rollback ERR
trap 'rollback 143' TERM
trap 'rollback 130' INT

# Refuse an automatic upgrade from an already broken application. Otherwise a
# failed candidate would roll back to a version that was never healthy.
# Use a short preflight window; the full 2-minute readiness budget is reserved
# for a newly started candidate and for rollback recovery.
wait_ready 3 || { echo "Existing API/frontend failed pre-release readiness; refusing automatic replacement" >&2; false; }

# A direct supervised invocation does not pass through auto-deploy.sh.
# It must perform the same full independent media backup/restore preflight;
# otherwise manual release would protect PostgreSQL but lose uploaded media.
# The inherited lock path is only accepted with the verified FD 9 above and
# already completed this media gate in the root-owned automatic builder.
if [[ "${USD_DEPLOY_LOCK_HELD:-0}" != 1 && -z "$local_hdd_snapshot" && "${USD_LOCAL_SECOND_DISK_APPROVED:-0}" != 1 ]]; then
  MEDIA_POLICY=/etc/usd-deployer/media-backup.conf
  MEDIA_VERIFIER=/usr/local/libexec/usd-verify-media-backup
  [[ -f "$MEDIA_POLICY" && ! -L "$MEDIA_POLICY" &&
     "$(stat -c %u "$MEDIA_POLICY")" == 0 ]] ||
    { echo "Missing or untrusted off-host media backup policy" >&2; false; }
  (( (8#$(stat -c %a "$MEDIA_POLICY") & 077) == 0 )) ||
    { echo "Off-host media backup policy must be root-only" >&2; false; }
  [[ -f "$MEDIA_VERIFIER" && -x "$MEDIA_VERIFIER" && ! -L "$MEDIA_VERIFIER" &&
     "$(stat -c %u "$MEDIA_VERIFIER")" == 0 ]] ||
    { echo "Missing or untrusted root-owned media backup verifier" >&2; false; }
  (( (8#$(stat -c %a "$MEDIA_VERIFIER") & 022) == 0 )) ||
    { echo "Off-host media backup verifier must not be group/world writable" >&2; false; }
  mapfile -t media_paths < "$MEDIA_POLICY"
  [[ "${#media_paths[@]}" == 2 && -n "${media_paths[0]}" && -n "${media_paths[1]}" &&
     "${media_paths[0]}" =~ ^[a-zA-Z0-9_-]+: && "${media_paths[1]}" =~ ^[a-zA-Z0-9_-]+: &&
     "${media_paths[0]%%:*}" != "${media_paths[1]%%:*}" ]] ||
    { echo "Media policy must specify distinct source and off-host rclone remotes" >&2; false; }
  media_snapshot="${media_paths[1]%/}/$NEW_TAG-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  "$MEDIA_VERIFIER" "${media_paths[0]}" "$media_snapshot" ||
    { echo "Independent media backup/full restore failed; refusing release" >&2; false; }
fi

# An on-host PostgreSQL dump alone cannot survive a Windows/VM disk failure.
# A separately configured off-host rclone target is mandatory before any
# release, including a supervised invocation of this helper.
if [[ -z "$local_hdd_snapshot" && "${USD_LOCAL_SECOND_DISK_APPROVED:-0}" != 1 ]]; then
DB_OFFSITE_POLICY=/etc/usd-deployer/db-backup.conf
DB_OFFSITE_VERIFIER=/usr/local/libexec/usd-verify-db-offsite-backup
[[ -f "$DB_OFFSITE_POLICY" && ! -L "$DB_OFFSITE_POLICY" &&
   "$(stat -c %u "$DB_OFFSITE_POLICY")" == 0 ]] ||
  { echo "Missing or untrusted off-host PostgreSQL backup policy" >&2; false; }
(( (8#$(stat -c %a "$DB_OFFSITE_POLICY") & 077) == 0 )) ||
  { echo "Off-host PostgreSQL backup policy must be root-only" >&2; false; }
[[ -f "$DB_OFFSITE_VERIFIER" && -x "$DB_OFFSITE_VERIFIER" && ! -L "$DB_OFFSITE_VERIFIER" &&
   "$(stat -c %u "$DB_OFFSITE_VERIFIER")" == 0 ]] ||
  { echo "Missing or untrusted off-host PostgreSQL backup verifier" >&2; false; }
(( (8#$(stat -c %a "$DB_OFFSITE_VERIFIER") & 022) == 0 )) ||
  { echo "Off-host PostgreSQL backup verifier must not be group/world writable" >&2; false; }
db_offsite_prefix="$(cat "$DB_OFFSITE_POLICY")"
# A named remote, not a local disk or a relative path. Do not trust paths
# containing traversal, spaces, rclone special remotes or shell expansion.
[[ "$db_offsite_prefix" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_-]*:[a-zA-Z0-9_/-]+$ &&
   "$db_offsite_prefix" != *"//"* && "$db_offsite_prefix" != */ ]] ||
  { echo "Invalid off-host PostgreSQL backup remote prefix" >&2; false; }
fi

# Keep a private custom-format database archive before replacing either service.
# This does not migrate, restore, restart or recreate PostgreSQL.
BACKUP_DIR="$STATE_DIR/backups"
[[ ! -L "$BACKUP_DIR" ]] || { echo "Refusing symlinked backup directory" >&2; false; }
install -d -o root -g root -m 0700 "$BACKUP_DIR"
[[ -d "$BACKUP_DIR" && ! -L "$BACKUP_DIR" && "$(stat -c %u "$BACKUP_DIR")" == 0 ]] ||
  { echo "Release backup directory must be root-owned" >&2; false; }
(( (8#$(stat -c %a "$BACKUP_DIR") & 077) == 0 )) ||
  { echo "Release backup directory must be private" >&2; false; }
db_snapshot_tmp="$(mktemp "$BACKUP_DIR/release-$NEW_TAG.XXXXXXXX.partial")"
docker compose --project-name "$PROJECT" --project-directory "$DEPLOY_DIR" --env-file .env "${compose_args[@]}" exec -T db sh -c \
  'pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$db_snapshot_tmp"
[[ -s "$db_snapshot_tmp" ]] || { echo "Database backup is empty" >&2; false; }
docker compose --project-name "$PROJECT" --project-directory "$DEPLOY_DIR" --env-file .env "${compose_args[@]}" exec -T db pg_restore --list < "$db_snapshot_tmp" >/dev/null
archive="${db_snapshot_tmp%.partial}.dump"
mv "$db_snapshot_tmp" "$archive"
db_snapshot_tmp=''
# PostgreSQL must remain the SAME healthy container throughout the backup.
# A DB restart or degraded database during pg_dump is not a safe release base.
[[ "$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=db")" == "$db_before" ]] ||
  { echo "Production DB container changed during backup; refusing release" >&2; false; }
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$db_before" 2>/dev/null)" == healthy ]] ||
  { echo "Production DB became unhealthy during backup; refusing release" >&2; false; }

# A separate off-host copy must be retrievable and byte-for-byte identical
# before the candidate is allowed to replace any live application container.
if [[ "${USD_LOCAL_SECOND_DISK_APPROVED:-0}" == 1 ]]; then
  [[ "${USD_DEPLOY_LOCK_HELD:-0}" == 1 && -z "$local_hdd_snapshot" ]] || { echo "Local second-disk release requires inherited lock" >&2; false; }
  [[ -f /etc/usd-deployer/local-second-disk-approved && ! -L /etc/usd-deployer/local-second-disk-approved && "$(stat -c %u /etc/usd-deployer/local-second-disk-approved)" == 0 && "$(cat /etc/usd-deployer/local-second-disk-approved)" == SAME_PC_SECOND_DISK_ACCEPTED ]] || { echo "Local second-disk release not approved" >&2; false; }
  (( (8#$(stat -c %a /etc/usd-deployer/local-second-disk-approved) & 077) == 0 )) || { echo "Unsafe second disk approval" >&2; false; }
  /usr/local/libexec/usd-verify-second-disk-db-backup "$archive" "release-$NEW_TAG-$(date -u +%Y%m%dT%H%M%SZ)-$$" || { echo "Second disk PostgreSQL copy failed; refusing release" >&2; false; }
elif [[ -z "$local_hdd_snapshot" ]]; then
  db_offsite_object="$db_offsite_prefix/release-$NEW_TAG-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
  "$DB_OFFSITE_VERIFIER" "$archive" "$db_offsite_object" ||
    { echo "Independent PostgreSQL backup/download verification failed; refusing release" >&2; false; }
else
  # The verified same-PC HDD snapshot, separate fresh local PG dump, and
  # isolated full restore/migration rehearsal are all mandatory.
  /usr/local/libexec/usd-verify-local-hdd-snapshot "$local_hdd_snapshot" ||
    { echo "Local HDD snapshot stale/corrupt before restore rehearsal" >&2; false; }
fi

# pg_restore --list checks archive structure, NOT whether a backup can actually
# be restored. Before touching either live application container, restore this
# exact fresh archive into an isolated PostgreSQL 18 volume and run the locally
# built candidate's Prisma migrations against that disposable copy. The helper
# must remove the copy even when verification fails; no production migration or
# production DB restart is performed by this step.
RESTORE_VERIFIER=/usr/local/libexec/usd-rehearse-schema-on-backup
[[ -f "$RESTORE_VERIFIER" && -x "$RESTORE_VERIFIER" && ! -L "$RESTORE_VERIFIER" &&
   "$(stat -c %u "$RESTORE_VERIFIER")" == 0 ]] ||
  { echo "Missing or untrusted root-owned PostgreSQL restore verifier; refusing release" >&2; false; }
(( (8#$(stat -c %a "$RESTORE_VERIFIER") & 022) == 0 )) ||
  { echo "PostgreSQL restore verifier must not be group/world writable" >&2; false; }
"$RESTORE_VERIFIER" "$archive" "$new_api_id" ||
  { echo "Fresh PostgreSQL restore/migration rehearsal failed; refusing release" >&2; false; }
[[ "$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=db")" == "$db_before" &&
   "$(docker inspect -f '{{.State.Health.Status}}' "$db_before" 2>/dev/null)" == healthy ]] ||
  { echo "Production DB changed during isolated restore rehearsal; refusing release" >&2; false; }

if [[ "$preflight_only" == 1 ]]; then
  # This receipt authorizes ONLY the separately installed, tightly scoped
  # first-run nullable-migration helper. No application image is replaced.
  receipt_tmp="$(mktemp "$STATE_DIR/initial-preflight.XXXXXXXX")"
  printf '%s\n%s\n%s\n' "$NEW_TAG" "$OLD_TAG" "$db_before" > "$receipt_tmp"
  chmod 0600 "$receipt_tmp"
  mv -f "$receipt_tmp" "$STATE_DIR/initial-preflight"
  rm -f -- "$backup"
  trap - ERR TERM INT
  echo 'First-release backup, independent download and isolated restore verified; live images and database were not changed'
  exit 0
fi

# Atomic replacement: never edit .env in place and never source it as shell.
tmp="$(mktemp "$DEPLOY_DIR/.env.release.XXXXXXXX")"
cp -p .env "$tmp"
# Long backup/rehearsal may overlap ordinary image pruning. Restore the SHA
# tags only from authenticated local content IDs. If the bytes disappeared,
# stop before changing .env; never let Compose pull replacement bytes by tag.
docker image tag "$new_api_id" "ghcr.io/kolyagazha89/usd-2.0-api:$NEW_TAG"
docker image tag "$new_frontend_id" "ghcr.io/kolyagazha89/usd-2.0-frontend:$NEW_TAG"
sed -i -E "s/^USD_IMAGE_TAG=[a-f0-9]{40}$/USD_IMAGE_TAG=$NEW_TAG/" "$tmp"
docker compose --project-name "$PROJECT" --project-directory "$DEPLOY_DIR" --env-file "$tmp" "${compose_args[@]}" config --quiet
# Off-host backups and a full PostgreSQL restore can take minutes or hours.
# A newer main push during that work must not let this automatic candidate
# replace the current application. This is the final check before changing
# production .env; direct, operator-supervised releases remain explicit.
if [[ "${USD_DEPLOY_LOCK_HELD:-0}" == 1 ]]; then
  defer_stale_main() { return 75; }
  remote_main="$(GIT_TERMINAL_PROMPT=0 timeout 20s git -C /opt/usd-release-source ls-remote --exit-code origin refs/heads/main)" || {
    echo "Cannot verify main after backup/restore; deferring automatic release" >&2
    defer_stale_main
  }
  latest_main="$(awk '$2 == "refs/heads/main" {print $1}' <<< "$remote_main")"
  if [[ ! "$latest_main" =~ ^[a-f0-9]{40}$ || "$latest_main" != "$NEW_TAG" ]]; then
    echo "Main moved or is invalid after backup/restore; deferring stale automatic release" >&2
    defer_stale_main
  fi
fi
changed=1
mv -f "$tmp" .env
docker compose --project-name "$PROJECT" --project-directory "$DEPLOY_DIR" --env-file .env "${compose_args[@]}" up -d --pull never --no-deps api frontend

# In-container checks work even when no localhost ports are published.
# Both services must return HTTP 200; checking 404 on the API is not sufficient.
wait_ready || { echo "New API/frontend failed readiness checks" >&2; false; }
verify_running_images "$NEW_TAG" || { echo "New API/frontend image tags do not match approved release SHA" >&2; false; }
db_after="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=db")"
[[ "$db_before" == "$db_after" ]] || { echo "Database container changed unexpectedly" >&2; false; }
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$db_after")" == healthy ]] ||
  { echo "Production DB became unhealthy during release" >&2; false; }

# Keep the rollback trap armed while checking external HTTPS, shipped assets,
# exact frontend/API revision, public data and unauthenticated access denial.
# Existing images remain available; never reverse database migrations here.
public_accepted=0
for public_attempt in 1 2 3; do
  if "$PUBLIC_VERIFIER" "$NEW_TAG"; then public_accepted=1; break; fi
  [[ "$public_attempt" == 3 ]] || sleep 5
done
[[ "$public_accepted" == 1 ]] || { echo "Public prerelease acceptance failed; rolling back application images" >&2; false; }

printf '%s\n' "$NEW_TAG" > "$STATE_DIR/deployed-sha"
rm -f "$backup" "$approval_file"
trap - ERR TERM INT
echo "USD release successful: $OLD_TAG -> $NEW_TAG"
