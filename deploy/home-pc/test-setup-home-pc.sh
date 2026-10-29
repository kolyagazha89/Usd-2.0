#!/usr/bin/env bash
# Test bootstrap admission with all host paths redirected to private fixtures.
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] || exit 1
WORK="$(mktemp -d)"
trap 'rm -rf -- "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/deploy"
printf 'APP_DOMAIN=app.usd-russia.ru\nAPI_DOMAIN=api.usd-russia.ru\nUSD_IMAGE_TAG=e8b5b0f22780a61e79765b8fd92167e241df82a2\n' > "$WORK/deploy/.env"
python3 - "$WORK" <<'PY'
from pathlib import Path
import sys
root=sys.argv[1]
s=Path('deploy/home-pc/setup-home-pc.sh').read_text()
for old,new in {
    '/home/usd/usd-deploy/deploy/home-pc':root+'/deploy',
    '/opt/usd-release-source':root+'/source',
    '/var/lib/usd-deployer':root+'/state',
    '/etc/usd-deployer':root+'/etc',
    '/run/lock/usd-home-deploy.lock':root+'/lock',
}.items():s=s.replace(old,new)
Path(root+'/setup').write_text(s)
PY
cat > "$WORK/bin/systemctl" <<'SH'
#!/usr/bin/env bash
if [[ "$1" == show ]]; then echo "${USD_TEST_UNIT_STATE:-not-found}"; exit 0; fi
if [[ "$1" == stop && "${USD_TEST_UNIT_STATE:-not-found}" != loaded ]]; then exit 5; fi
SH
cat > "$WORK/bin/git" <<'SH'
#!/usr/bin/env bash
# Deliberate checkpoint: no cloning, account setup or later host writes occur.
exit 77
SH
for tool in docker rclone gh; do printf '#!/bin/sh\nexit 0\n' > "$WORK/bin/$tool"; done
chmod +x "$WORK/bin/"*
for state in not-found loaded; do
  set +e
  PATH="$WORK/bin:$PATH" USD_TEST_UNIT_STATE="$state" bash "$WORK/setup" > "$WORK/$state.log" 2>&1
  result=$?
  set -e
  [[ "$result" == 77 ]] || { cat "$WORK/$state.log"; echo "Bootstrap did not reach source preparation with unit=$state (exit $result)"; exit 1; }
done
# Official archives have bin/runsvc.sh, not the top-level service entrypoint.
mkdir -p "$WORK/runner/bin"
printf '#!/bin/sh\necho runner-fixture\n' > "$WORK/runner/bin/runsvc.sh"
chmod 0755 "$WORK/runner/bin/runsvc.sh"
bash deploy/home-pc/prepare-runner-launcher.sh "$WORK/runner"
[[ -x "$WORK/runner/runsvc.sh" ]]
[[ "$("$WORK/runner/runsvc.sh")" == runner-fixture ]]
echo 'Bootstrap handles missing/existing timers and official runner archive layout'
