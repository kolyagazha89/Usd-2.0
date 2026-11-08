#!/usr/bin/env python3
"""Offline regression tests: signed USD releases cannot skip pinned Cosign validation."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('install-ci-cosign.sh')
PINNED_SHA = '4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71'
OFFICIAL_URL = 'https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64'


class InstallCiCosignTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='usd-cosign-ci-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / 'fakebin'
        self.bin.mkdir()
        self.runner_temp = self.root / 'runner'
        self.runner_temp.mkdir()
        self.github_path = self.root / 'github-path'
        self.github_path.touch()
        self.fixture = self.root / 'fixture-cosign'
        self.fixture.write_text('#!/bin/sh\n[ "$1" = version ] && [ "$2" = --json ]\n')
        self.fixture.chmod(0o755)
        self.fixture_sha = hashlib.sha256(self.fixture.read_bytes()).hexdigest()
        self.fake_curl = self.bin / 'curl'
        self.fake_curl.write_text(
            '#!/usr/bin/env python3\n'
            'import os, pathlib, sys\n'
            'args=sys.argv[1:]\n'
            'url="https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64"\n'
            'if url not in args or "--proto" not in args or "=https" not in args: sys.exit(44)\n'
            'if os.environ.get("USD_TEST_CURL_FAILURE") == "1": sys.exit(22)\n'
            'pathlib.Path(args[args.index("-o")+1]).write_bytes(pathlib.Path(os.environ["USD_TEST_BINARY"]).read_bytes())\n'
        )
        self.fake_curl.chmod(0o755)
        # No unit test may accidentally pull a real image when the CDN is down.
        fake_docker = self.bin / 'docker'
        fake_docker.write_text('#!/bin/sh\nexit 42\n')
        fake_docker.chmod(0o755)

    def run_installer(self, *, replace_hash=True, fixture=None, extra_env=None):
        source = SCRIPT.read_text()
        self.assertIn(PINNED_SHA, source)
        self.assertIn(OFFICIAL_URL, source)
        self.assertIn('sha256sum -c -', source)
        if replace_hash:
            source = source.replace(PINNED_SHA, self.fixture_sha)
        runnable = self.root / 'installer.sh'
        runnable.write_text(source)
        runnable.chmod(0o700)
        env = dict(os.environ, GITHUB_ACTIONS='true', RUNNER_TEMP=str(self.runner_temp),
                   GITHUB_PATH=str(self.github_path), USD_TEST_BINARY=str(fixture or self.fixture),
                   PATH=str(self.bin)+os.pathsep+os.environ['PATH'])
        env.update(extra_env or {})
        return subprocess.run(['bash', str(runnable)], env=env, capture_output=True, text=True, timeout=20)

    def test_successful_verified_binary_is_added_to_job_path(self):
        result = self.run_installer()
        self.assertEqual(0, result.returncode, result.stderr)
        dirs = self.github_path.read_text().splitlines()
        self.assertEqual(1, len(dirs))
        binary = Path(dirs[0]) / 'cosign'
        self.assertEqual(self.fixture.read_bytes(), binary.read_bytes())
        self.assertTrue(os.access(binary, os.X_OK))
        self.assertEqual(self.fixture_sha, hashlib.sha256(binary.read_bytes()).hexdigest())

    def test_hash_mismatch_fails_closed_without_exposing_binary(self):
        result = self.run_installer(replace_hash=False)
        self.assertNotEqual(0, result.returncode)
        self.assertEqual('', self.github_path.read_text())
        self.assertEqual([], list(self.runner_temp.glob('usd-cosign-ci.*/cosign')))

    def test_network_failure_does_not_append_path_or_use_unverified_fallback(self):
        result = self.run_installer(extra_env={'USD_TEST_CURL_FAILURE': '1'})
        self.assertNotEqual(0, result.returncode)
        self.assertEqual('', self.github_path.read_text())
        self.assertEqual([], list(self.runner_temp.glob('usd-cosign-ci.*/cosign')))

    def test_runner_gate_prevents_untrusted_local_install(self):
        result = self.run_installer(extra_env={'GITHUB_ACTIONS': 'false'})
        self.assertNotEqual(0, result.returncode)
        self.assertEqual('', self.github_path.read_text())

    def test_environment_cannot_override_pinned_hash(self):
        result = self.run_installer(replace_hash=False, extra_env={
            'USD_COSIGN_SHA256': self.fixture_sha, 'COSIGN_SHA256': self.fixture_sha})
        self.assertNotEqual(0, result.returncode)
        self.assertEqual('', self.github_path.read_text())


if __name__ == '__main__':
    unittest.main()
