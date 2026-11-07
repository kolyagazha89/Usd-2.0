#!/usr/bin/env python3
"""Execute the installer's recovery block against isolated root-owned fixtures."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('install-local-deployer.sh').read_text()
BLOCK = SCRIPT.split('if [[ "$review_retry" == 1 ]]; then', 1)[1].split(
    'echo "USD helpers installed', 1)[0]
SHA = 'a' * 40
OLD = 'b' * 40
PIN = 'c' * 40


@unittest.skipUnless(os.geteuid() == 0, 'run in isolated root test container')
class ReviewedRecoveryTests(unittest.TestCase):
    def run_recovery(self, *, helper_exit=0, already_reviewed=False, tag=OLD,
                     remote=SHA, branch='main', env_mode=0o600, failed_sha=SHA):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / 'state'
            state.mkdir(mode=0o700)
            marker = state / 'failed-release-sha'
            marker.write_text(failed_sha + '\n')
            marker.chmod(0o600)
            pin = state / 'schema-pin'
            pin.write_text(PIN + '\n')
            pin.chmod(0o600)
            legacy = root / 'legacy-pin'
            legacy.write_text('d' * 40 + '\n')
            legacy.chmod(0o600)
            env = root / 'env'
            env.write_text('USD_IMAGE_TAG=' + tag + '\nPRIVATE_SECRET=never-print\n')
            env.chmod(env_mode)
            reviewed = state / ('reviewed-failed-release-' + failed_sha)
            if already_reviewed:
                reviewed.write_text('existing audit')
            helper = root / 'helper'
            helper.write_text('#!/bin/bash\n[[ "$USD_DEPLOY_LOCK_HELD" == 1 ]] || exit 92\n'
                              'test -e /proc/self/fd/9 || exit 93\n'
                              f'printf "%s\\n" "$@" > {root}/args\nexit {helper_exit}\n')
            helper.chmod(0o755)
            block = BLOCK.replace('/var/lib/usd-deployer', str(state)).replace(
                '/home/usd/usd-deploy/deploy/home-pc/.env', str(env)).replace(
                '/usr/local/libexec/usd-safe-schema-migration', str(helper))
            setup = f'''set -Eeuo pipefail
exec 9>"{root}/lock"
flock -n 9
PIN="{pin}"
LEGACY_PIN="{legacy}"
git() {{
 case "$*" in
  *'remote get-url origin') echo https://github.com/kolyagazha89/Usd-2.0.git ;;
  *'rev-parse --abbrev-ref HEAD') echo {branch} ;;
  *'ls-remote --exit-code origin refs/heads/main') printf '{remote}\\trefs/heads/main\\n' ;;
  'rev-parse --show-toplevel') echo "{root}" ;;
  *'rev-parse HEAD') echo {SHA} ;;
  *) return 91 ;;
 esac
}}
lsattr() {{ echo '--------------e------- pin'; }}
if true; then
'''
            result = subprocess.run(['bash', '-c', setup + block], capture_output=True, text=True)
            args = (root / 'args').read_text().splitlines() if (root / 'args').exists() else None
            self.assertNotIn('never-print', result.stdout + result.stderr)
            self.assertEqual(pin.read_text(), PIN + '\n')
            self.assertEqual(legacy.read_text(), 'd' * 40 + '\n')
            return result, marker.exists(), reviewed.read_text() if reviewed.exists() else None, args

    def test_progressed_pin_uses_current_live_check_and_retains_audit(self):
        result, quarantined, audit, args = self.run_recovery()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(quarantined)
        self.assertEqual(audit, SHA + '\n')
        self.assertEqual(args, ['--check', SHA, OLD, PIN])

    def test_failed_live_review_preserves_quarantine(self):
        result, quarantined, audit, _ = self.run_recovery(helper_exit=1)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(quarantined)
        self.assertIsNone(audit)

    def test_invalid_or_duplicate_deployed_sha_preserves_quarantine(self):
        for tag in ('invalid', OLD + '\nUSD_IMAGE_TAG=' + OLD):
            with self.subTest(tag=tag):
                result, quarantined, _, args = self.run_recovery(tag=tag)
                self.assertNotEqual(result.returncode, 0)
                self.assertTrue(quarantined)
                self.assertIsNone(args)

    def test_repeated_review_preserves_original_audit(self):
        result, quarantined, audit, args = self.run_recovery(already_reviewed=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(quarantined)
        self.assertEqual(audit, 'existing audit')
        self.assertIsNone(args)

    def test_remote_movement_or_wrong_branch_blocks_review(self):
        for options in ({'remote': OLD}, {'branch': 'HEAD'}):
            with self.subTest(options=options):
                result, quarantined, _, args = self.run_recovery(**options)
                self.assertNotEqual(result.returncode, 0)
                self.assertTrue(quarantined)
                self.assertIsNone(args)

    def test_nonprivate_environment_blocks_review(self):
        result, quarantined, _, args = self.run_recovery(env_mode=0o644)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(quarantined)
        self.assertIsNone(args)

    def test_newer_main_retains_old_quarantine_without_recovery(self):
        result, quarantined, audit, args = self.run_recovery(failed_sha=OLD)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(quarantined)
        self.assertIsNone(audit)
        self.assertIsNone(args)


if __name__ == '__main__':
    unittest.main()
