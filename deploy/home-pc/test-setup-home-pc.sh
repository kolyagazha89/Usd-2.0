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

# Exercise the schema gate before helper installation or touching a live DB.
# Mock CI returns 77 only when the reviewed candidate reached the CI gate.
mkdir -p "$WORK/source/.git" "$WORK/source/deploy/home-pc"
printf 'import sys\nsys.exit(77)\n' > "$WORK/source/deploy/home-pc/verify-main-ci.py"
cat > "$WORK/bin/git" <<'SH'
#!/usr/bin/env bash
case "$*" in
 *'remote get-url origin') echo https://github.com/kolyagazha89/Usd-2.0.git ;;
 *'rev-parse FETCH_HEAD') echo "$USD_TEST_NEW_SHA" ;;
 *'rev-parse '*':backend/prisma')
   if [[ "$*" == *"$USD_TEST_OLD_SHA:backend/prisma"* ]]; then
     echo "$USD_TEST_OLD_TREE"
   else
     echo "$USD_TEST_NEW_TREE"
   fi ;;
 *) exit 0 ;;
esac
SH
chmod 755 "$WORK/bin/git"
TEAM_BASE=e0c244bad7f77f576f1889abe36bf1dc0a9db735
LEGACY_BASE=e8b5b0f22780a61e79765b8fd92167e241df82a2
INITIAL_TREE=4d9fa43dafd01e58354c3d22ead2cafe45152044
TEAM_TREE=a22c242dd0c6dfa9554f179cf705b39499a68967
NEW_SHA=1b6c6e3a7eb72a634da0f97a471f2ecc5e078080
check_schema_gate() {
  local old_sha="$1" old_tree="$2" new_tree="$3" expected="$4" exit_code
  printf 'APP_DOMAIN=app.usd-russia.ru\nAPI_DOMAIN=api.usd-russia.ru\nUSD_IMAGE_TAG=%s\n' "$old_sha" > "$WORK/deploy/.env"
  chmod 600 "$WORK/deploy/.env"
  set +e
  PATH="$WORK/bin:$PATH" USD_TEST_UNIT_STATE=not-found \
    USD_TEST_OLD_SHA="$old_sha" USD_TEST_OLD_TREE="$old_tree" \
    USD_TEST_NEW_SHA="$NEW_SHA" USD_TEST_NEW_TREE="$new_tree" \
    bash "$WORK/setup" > "$WORK/schema-gate.log" 2>&1
  exit_code=$?
  set -e
  [[ "$exit_code" == "$expected" ]] || {
    echo "Unexpected setup schema admission ($old_sha, $new_tree): exit=$exit_code expected=$expected"
    cat "$WORK/schema-gate.log"
    exit 1
  }
  if [[ "$expected" == 1 ]]; then grep -Fq 'BLOCK: unknown source or Prisma tree' "$WORK/schema-gate.log"; fi
}
check_schema_gate "$TEAM_BASE" "$INITIAL_TREE" "$INITIAL_TREE" 77
check_schema_gate "$TEAM_BASE" "$INITIAL_TREE" "$TEAM_TREE" 77
check_schema_gate "$LEGACY_BASE" "$INITIAL_TREE" "$INITIAL_TREE" 77
check_schema_gate "$TEAM_BASE" "$INITIAL_TREE" cccccccccccccccccccccccccccccccccccccccc 1
check_schema_gate "$LEGACY_BASE" "$INITIAL_TREE" "$TEAM_TREE" 1
check_schema_gate ffffffffffffffffffffffffffffffffffffffff "$INITIAL_TREE" "$TEAM_TREE" 1
echo 'PASS: same-schema bootstrap, pinned team upgrade and unreviewed schema refusal'

