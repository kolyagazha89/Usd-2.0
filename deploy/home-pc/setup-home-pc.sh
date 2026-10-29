#!/usr/bin/env bash
# One supervised setup, then ordinary same-schema main pushes need no SSH work.
# Credentials are entered locally through rclone/GitHub; never paste them in chat.
set -Eeuo pipefail
umask 077
[[ "$(id -u)" == 0 && $# == 0 ]] || { echo 'Run: sudo bash deploy/home-pc/setup-home-pc.sh' >&2; exit 2; }
REPO=https://github.com/kolyagazha89/Usd-2.0.git
SOURCE=/opt/usd-release-source
STATE=/var/lib/usd-deployer
DEPLOY=/home/usd/usd-deploy/deploy/home-pc
RUNNER=/opt/usd-deploy-runner
RUNNER_USER=usd-runner
RUNNER_UNIT=actions.runner.usd-home-pc.service
BASELINE=e8b5b0f22780a61e79765b8fd92167e241df82a2
usd_gh_config=''
usd_setup_done=0
usd_timer_paused=0
cleanup() {
  local result=$?
  [[ -z "$usd_gh_config" ]] || rm -rf -- "$usd_gh_config"
  if [[ "$usd_setup_done" != 1 && "$usd_timer_paused" == 1 ]]; then
    echo 'Настройка не завершена. Текущая БД не пересоздавалась. Проверьте ошибку выше; таймер не запускается до исправления.' >&2
  fi
  exit "$result"
}
trap cleanup EXIT

[[ -f "$DEPLOY/.env" && ! -L "$DEPLOY/.env" ]] || { echo 'Existing deployment .env not found; no empty database will be created' >&2; exit 1; }
python3 - "$DEPLOY/.env" <<'PY'
from pathlib import Path
import re,sys
values={}
for raw in Path(sys.argv[1]).read_text().splitlines():
    key,sep,val=raw.strip().partition('=')
    if key not in ('APP_DOMAIN','API_DOMAIN','USD_IMAGE_TAG'):continue
    if not sep or key in values:raise SystemExit('Duplicate deployment target; setup refused')
    values[key]=val.strip().strip('"\'')
if values.get('APP_DOMAIN')!='app.usd-russia.ru' or values.get('API_DOMAIN')!='api.usd-russia.ru':
    raise SystemExit('Setup targets only app.usd-russia.ru and api.usd-russia.ru')
if not re.fullmatch('[a-f0-9]{40}',values.get('USD_IMAGE_TAG','')):raise SystemExit('Missing full deployed SHA')
PY
for tool in git docker python3 flock curl sha256sum systemctl useradd runuser install; do
  command -v "$tool" >/dev/null || { echo "Missing Ubuntu prerequisite: $tool" >&2; exit 1; }
done
docker compose version >/dev/null
if ! command -v rclone >/dev/null || ! command -v gh >/dev/null; then
  echo 'Установка rclone и GitHub CLI для однократной настройки.'
  apt-get update
  apt-get install -y rclone gh ca-certificates
fi
for path in "$SOURCE" "$STATE" /etc/usd-deployer; do
  [[ ! -L "$path" ]] || { echo "Refusing symlinked setup path: $path" >&2; exit 1; }
  if [[ -e "$path" ]]; then
    [[ "$(stat -c %u "$path")" == 0 ]] && (( (8#$(stat -c %a "$path") & 022) == 0 )) ||
      { echo "Setup path is not root-controlled: $path" >&2; exit 1; }
  fi
done
install -d -o root -g root -m 0700 "$STATE" /etc/usd-deployer
echo 'Ожидание завершения текущей операции деплоя.'
if [[ "$(systemctl show --property=LoadState --value usd-auto-deploy.timer)" == loaded ]]; then
  systemctl stop usd-auto-deploy.timer
  usd_timer_paused=1
fi
exec 9>/run/lock/usd-home-deploy.lock
flock -w 180 9 || { echo 'Current deployment is still active; setup did not interrupt it' >&2; exit 75; }
if [[ ! -d "$SOURCE/.git" ]]; then git clone --no-checkout --filter=blob:none "$REPO" "$SOURCE"; fi
[[ "$(git -C "$SOURCE" remote get-url origin)" == "$REPO" ]] || { echo 'Unexpected source remote' >&2; exit 1; }
git -C "$SOURCE" fetch --no-tags --depth=1 origin main
SHA="$(git -C "$SOURCE" rev-parse FETCH_HEAD)"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || exit 1
git -C "$SOURCE" checkout --force --detach "$SHA"
git -C "$SOURCE" clean -ffdx
echo "Проверка CI для main: $SHA"
python3 "$SOURCE/deploy/home-pc/verify-main-ci.py" "$SHA" 1
for service in api frontend; do
  docker pull "ghcr.io/kolyagazha89/usd-2.0-$service:$SHA"
  [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "ghcr.io/kolyagazha89/usd-2.0-$service:$SHA")" == "$SHA" ]] ||
    { echo "Image revision mismatch: $service" >&2; exit 1; }
done
# The installer serializes itself using this same lock; release it only for
# installation, then reacquire before any approvals, backup or migration.
flock -u 9
bash "$SOURCE/deploy/home-pc/install-local-deployer.sh"
flock -w 180 9 || exit 75
python3 "$SOURCE/deploy/home-pc/prepare-host-files.py"
OLD="$(sed -n -E 's/^USD_IMAGE_TAG=([a-f0-9]{40})$/\1/p' "$DEPLOY/.env")"
[[ "$OLD" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid deployed SHA' >&2; exit 1; }

export RCLONE_CONFIG="$STATE/rclone.conf"
export RCLONE_CACHE_DIR="$STATE/rclone-cache"
if [[ ! -e "$RCLONE_CONFIG" && -f /root/.config/rclone/rclone.conf && ! -L /root/.config/rclone/rclone.conf ]]; then
  install -o root -g root -m 0600 /root/.config/rclone/rclone.conf "$RCLONE_CONFIG"
fi
[[ ! -L "$RCLONE_CONFIG" ]] || { echo 'Refusing symlinked rclone credentials' >&2; exit 1; }
if [[ -e "$RCLONE_CONFIG" ]]; then
  [[ "$(stat -c %u "$RCLONE_CONFIG")" == 0 ]] || { echo 'rclone credentials must be root-owned' >&2; exit 1; }
  chmod 0600 "$RCLONE_CONFIG"
fi
echo 'Резервные копии должны храниться вне этого компьютера, в защищённом удалённом хранилище.'
echo 'Настройте rclone: источник с текущими фотографиями и отдельное внешнее хранилище (желательно crypt).'
if [[ ! -s /etc/usd-deployer/db-backup.conf || ! -s /etc/usd-deployer/media-backup.conf ]]; then
  rclone config
  rclone listremotes
  read -r -p 'Текущие медиа, remote:bucket/path: ' usd_media_source
  read -r -p 'Внешняя папка для копий медиа, remote:bucket/path: ' usd_media_backup
  read -r -p 'Внешняя папка для копий БД, remote:bucket/path: ' usd_db_backup
  python3 - "$usd_media_source" "$usd_media_backup" "$usd_db_backup" <<'PY'
import re,sys
source,media,db=sys.argv[1:]
for raw in (source,media,db):
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_-]*:[A-Za-z0-9_/-]+',raw) or raw.endswith('/') or ':/' in raw or '//' in raw:
        raise SystemExit('Use a named remote and nonempty simple path without spaces/traversal')
if source.split(':')[0]==media.split(':')[0]:raise SystemExit('Media source and backup need independently configured remotes')
PY
  printf '%s\n%s\n' "$usd_media_source" "$usd_media_backup" > /etc/usd-deployer/media-backup.conf
  printf '%s\n' "$usd_db_backup" > /etc/usd-deployer/db-backup.conf
  chmod 0600 /etc/usd-deployer/{media,db}-backup.conf
fi

# Use a disposable GitHub CLI profile. Administrative OAuth credentials are
# removed on exit; the unprivileged runner receives only its runner identity.
[[ ! -v GH_TOKEN && ! -v GITHUB_TOKEN ]] || { echo 'Do not pass a GitHub token through the setup environment' >&2; exit 1; }
usd_gh_config="$(mktemp -d "$STATE/github-login.XXXXXXXX")"
export GH_CONFIG_DIR="$usd_gh_config"
echo 'Однократный вход GitHub: откройте показанную ссылку и подтвердите код в своём браузере.'
gh auth login --hostname github.com --git-protocol https --web --scopes repo
gh api repos/kolyagazha89/Usd-2.0 --jq '.permissions.admin' | grep -qx true ||
  { echo 'GitHub repository administrator access is needed to register its runner' >&2; exit 1; }

if ! id "$RUNNER_USER" >/dev/null 2>&1; then
  useradd --system --user-group --create-home --home-dir /var/lib/usd-runner --shell /bin/bash "$RUNNER_USER"
fi
for group in $(id -nG "$RUNNER_USER"); do
  case "$group" in root|sudo|wheel|docker) echo "Unsafe runner group: $group" >&2; exit 1 ;; esac
done
[[ "$(id -u "$RUNNER_USER")" != 0 && ! -L "$RUNNER" ]] || exit 1
if [[ ! -f "$RUNNER/.runner" ]]; then
  [[ ! -e "$RUNNER" ]] || { echo 'Unregistered runner directory already exists; refusing overwrite' >&2; exit 1; }
  install -d -o root -g root -m 0700 "$RUNNER"
  usd_runner_download="$(gh api repos/actions/runner/releases/latest --jq '.assets[] | select(.name | test("^actions-runner-linux-x64-.*\\.tar\\.gz$")) | [.browser_download_url,.digest] | @tsv')"
  IFS=$'\t' read -r usd_runner_url usd_runner_digest <<< "$usd_runner_download"
  [[ "$usd_runner_url" == https://github.com/actions/runner/releases/download/* && "$usd_runner_digest" =~ ^sha256:[a-f0-9]{64}$ ]] ||
    { echo 'Official Linux runner archive or its SHA256 digest was not available' >&2; exit 1; }
  usd_runner_archive="$(mktemp "$STATE/runner.XXXXXXXX.tgz")"
  curl -fsSL --retry 3 --max-time 180 "$usd_runner_url" -o "$usd_runner_archive"
  printf '%s  %s\n' "${usd_runner_digest#sha256:}" "$usd_runner_archive" | sha256sum -c -
  tar --no-same-owner -xzf "$usd_runner_archive" -C "$RUNNER"
  rm -f -- "$usd_runner_archive"
  # Execute only this newly checksum-verified dependency installer as root.
  bash "$RUNNER/bin/installdependencies.sh"
  bash "$SOURCE/deploy/home-pc/prepare-runner-launcher.sh" "$RUNNER"
  chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER"
  usd_runner_token="$(gh api --method POST repos/kolyagazha89/Usd-2.0/actions/runners/registration-token --jq .token)"
  runuser -u "$RUNNER_USER" -- bash -c 'cd "$1"; exec ./config.sh --unattended --url https://github.com/kolyagazha89/Usd-2.0 --token "$2" --name usd-home-pc --labels usd-home-pc --work _work' bash "$RUNNER" "$usd_runner_token"
  unset usd_runner_token
fi
[[ -x "$RUNNER/runsvc.sh" ]] || { echo 'Registered runner installation is incomplete: runsvc.sh missing' >&2; exit 1; }
usd_runner_id="$(python3 - "$RUNNER/.runner" <<'PY'
import json,sys
data=json.load(open(sys.argv[1]))
if data.get('gitHubUrl','').rstrip('/')!='https://github.com/kolyagazha89/Usd-2.0':raise SystemExit('Runner is registered to a different repository')
print(int(data['agentId']))
PY
)"
gh api "repos/kolyagazha89/Usd-2.0/actions/runners/$usd_runner_id" --jq '.labels[].name' | grep -qx usd-home-pc ||
  { echo 'Registered runner lacks the usd-home-pc label' >&2; exit 1; }

# Never execute a runner-writable svc.sh as root on a later setup run. Install
# our fixed root-owned unit; runsvc.sh itself always executes as usd-runner.
usd_unit_tmp="$(mktemp)"
cat > "$usd_unit_tmp" <<'UNIT'
[Unit]
Description=USD unprivileged GitHub Actions deployment trigger
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
User=usd-runner
Group=usd-runner
WorkingDirectory=/opt/usd-deploy-runner
ExecStart=/opt/usd-deploy-runner/runsvc.sh
KillMode=process
KillSignal=SIGTERM
TimeoutStopSec=5min
Restart=always
RestartSec=15s
ProtectSystem=full
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

[Install]
WantedBy=multi-user.target
UNIT
install -o root -g root -m 0644 "$usd_unit_tmp" "/etc/systemd/system/$RUNNER_UNIT"
rm -f -- "$usd_unit_tmp"
if [[ ! -e /etc/sudoers.d/usd-home-pc-trigger ]]; then
  bash "$SOURCE/deploy/home-pc/install-runner-trigger.sh" "$RUNNER_USER"
else
  [[ "$(cat /etc/sudoers.d/usd-home-pc-trigger)" == "$RUNNER_USER ALL=(root) NOPASSWD: /usr/bin/systemctl start usd-auto-deploy.service" ]] ||
    { echo 'Existing runner sudoers policy differs; refusing to replace it' >&2; exit 1; }
fi

printf '%s\n' "$SHA" > "$STATE/built-sha"
/usr/local/libexec/usd-initial-schema --check "$SHA"
if [[ "$OLD" != "$SHA" ]]; then
  for usd_policy in /etc/usd-deployer/{media,db}-backup.conf; do
    [[ -f "$usd_policy" && ! -L "$usd_policy" && "$(stat -c %u "$usd_policy")" == 0 ]] &&
      (( (8#$(stat -c %a "$usd_policy") & 077) == 0 )) || { echo 'Backup policy must be private and root-owned' >&2; exit 1; }
  done
  mapfile -t usd_media_paths < /etc/usd-deployer/media-backup.conf
  [[ "${#usd_media_paths[@]}" == 2 && "${usd_media_paths[0]%%:*}" != "${usd_media_paths[1]%%:*}" ]] ||
    { echo 'Media source and off-host destination must be independently configured' >&2; exit 1; }
  echo 'Проверка полной внешней копии медиа и её восстановления.'
  /usr/local/libexec/usd-verify-media-backup "${usd_media_paths[0]}" "${usd_media_paths[1]%/}/$SHA-$(date -u +%Y%m%dT%H%M%SZ)-$$-setup"
  printf '%s\n' "$SHA" > "$STATE/schema-approved-sha"
  printf '%s\n' "$SHA" > "$STATE/release-approved-sha"
  if [[ "$OLD" == "$BASELINE" ]]; then
    echo 'Проверка реальной резервной копии и восстановления перед двумя проверенными добавочными миграциями.'
    USD_DEPLOY_LOCK_HELD=1 /usr/local/sbin/usd-release-approved "$SHA" --preflight-only
    USD_DEPLOY_LOCK_HELD=1 /usr/local/libexec/usd-initial-schema --apply "$SHA"
  fi
  echo 'Первый релиз API и публичной части с проверкой отката.'
  USD_DEPLOY_LOCK_HELD=1 /usr/local/sbin/usd-release-approved "$SHA"
fi
/usr/local/libexec/usd-verify-prerelease "$SHA"
git -C "$SOURCE" rev-parse "$SHA:backend/prisma" > /etc/usd-auto-release-schema
chmod 0600 /etc/usd-auto-release-schema
install -o root -g root -m 0600 /dev/null /etc/usd-deploy-enabled
flock -u 9
systemctl daemon-reload
systemctl enable --now "$RUNNER_UNIT" usd-auto-deploy.timer
usd_timer_paused=0
systemctl is-active --quiet "$RUNNER_UNIT"

# A reviewed, harmless repository marker exercises a NEW push. Do not invoke
# the release service ourselves here: the runner/timer must process it.
echo 'Создание контрольного коммита и проверка повторного автоматического деплоя.'
usd_probe_content="$(python3 - "$SHA" <<'PY'
import base64,datetime,json,sys,uuid
payload={'requested_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base_revision':sys.argv[1],'probe':uuid.uuid4().hex}
print(base64.b64encode((json.dumps(payload,indent=2)+'\n').encode()).decode())
PY
)"
usd_probe_blob="$(gh api repos/kolyagazha89/Usd-2.0/contents/deploy/home-pc/deployment-probe.json --jq .sha 2>/dev/null || true)"
usd_probe_args=(--method PUT repos/kolyagazha89/Usd-2.0/contents/deploy/home-pc/deployment-probe.json
  -f 'message=ci: verify USD home-PC automatic deployment' -f branch=main -f "content=$usd_probe_content")
[[ -z "$usd_probe_blob" ]] || usd_probe_args+=(-f "sha=$usd_probe_blob")
PROBE="$(gh api "${usd_probe_args[@]}" --jq .commit.sha)"
[[ "$PROBE" =~ ^[a-f0-9]{40}$ ]] || { echo 'Could not identify the control commit; inspect GitHub before retrying' >&2; exit 1; }
echo "Контрольный коммит: $PROBE. Ожидаем CI, публикацию и автоматическое обновление."
for usd_attempt in $(seq 1 300); do
  if [[ -f "$STATE/deployed-sha" && "$(cat "$STATE/deployed-sha")" == "$PROBE" ]] &&
     /usr/local/libexec/usd-verify-prerelease "$PROBE"; then
    usd_runs="$(gh api "repos/kolyagazha89/Usd-2.0/actions/runs?head_sha=$PROBE&per_page=100")"
    usd_job="$(python3 -c 'import json,sys; rows=json.load(sys.stdin)["workflow_runs"]; good=[x for x in rows if x["path"]==".github/workflows/request-home-pc-deploy.yml" and x["status"]=="completed" and x["conclusion"]=="success"]; print(max((x["id"] for x in good),default=""))' <<< "$usd_runs")"
    if [[ -n "$usd_job" ]] && gh api "repos/kolyagazha89/Usd-2.0/actions/runs/$usd_job/jobs" --jq ".jobs[] | select(.runner_id == $usd_runner_id and .conclusion == \"success\") | .id" | grep -qE '^[0-9]+$'; then
      usd_setup_done=1
      echo "USD: первый релиз и новый автоматический деплой подтверждены на app.usd-russia.ru ($PROBE)."
      exit 0
    fi
  fi
  sleep 30
done
echo 'Контрольный автодеплой пока не подтверждён. Текущая версия сохранена; проверьте GitHub Actions и journalctl -u usd-auto-deploy.service.' >&2
exit 1
