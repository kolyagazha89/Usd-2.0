#!/usr/bin/env python3
"""Offline tests for independently pinned OCI Cosign fallback (no real network)."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('install-ci-cosign.sh')
PINNED_RELEASE_SHA = '4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71'
OCI_REF = 'ghcr.io/sigstore/cosign/cosign@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8'
OCI_BINARY_SHA = 'a57926e24b07f02b5baf3be81f9a5988e9e45d8a1ca8ca500cdf56d10e69f887'


class OciCosignInstallTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix='usd-cosign-oci-test-')
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.runner = self.root / 'runner'
        self.runner.mkdir()
        self.ghpath = self.root / 'github-path'
        self.ghpath.touch()
        self.oci_fixture = self.root / 'oci-cosign'
        self.oci_fixture.write_text('#!/bin/sh\n[ "$1" = version ] && [ "$2" = --json ]\n# official OCI binary fixture\n')
        self.oci_fixture.chmod(0o755)
        self.fixture_sha = hashlib.sha256(self.oci_fixture.read_bytes()).hexdigest()
        curl = self.bin / 'curl'
        curl.write_text('#!/bin/sh\nexit 22\n')
        curl.chmod(0o755)
        self.log = self.root / 'docker-commands'
        docker = self.bin / 'docker'
        docker.write_text(
            '#!/usr/bin/env python3\n'
            'import os,pathlib,sys\n'
            'args=sys.argv[1:]\n'
            'with pathlib.Path(os.environ["USD_TEST_DOCKER_LOG"]).open("a") as log: log.write(" ".join(args)+"\\n")\n'
            'expected="ghcr.io/sigstore/cosign/cosign@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8"\n'
            'if args[0]=="pull":\n'
            '  if args[-1]!=expected or os.environ.get("USD_TEST_PULL_FAIL")=="1": sys.exit(42)\n'
            'elif args[0]=="create":\n'
            '  if args[-1]!=expected: sys.exit(42)\n'
            '  print("synthetic-oci-container")\n'
            'elif args[0]=="cp":\n'
            '  if args[1]!="synthetic-oci-container:/ko-app/cosign": sys.exit(42)\n'
            '  pathlib.Path(args[2]).write_bytes(pathlib.Path(os.environ["USD_TEST_OCI_BIN"]).read_bytes())\n'
            'elif args[0]=="rm":\n'
            '  if args[-1]!="synthetic-oci-container": sys.exit(42)\n'
            'else: sys.exit(42)\n'
        )
        docker.chmod(0o755)

    def run_installer(self, *, accept_fixture=True, extra=None):
        source = SCRIPT.read_text()
        self.assertIn(PINNED_RELEASE_SHA, source)
        self.assertIn(OCI_REF, source)
        self.assertIn(OCI_BINARY_SHA, source)
        if accept_fixture:
            source = source.replace(OCI_BINARY_SHA, self.fixture_sha)
        script = self.root / 'install.sh'
        script.write_text(source)
        env = dict(os.environ, GITHUB_ACTIONS='true', RUNNER_TEMP=str(self.runner),
                   GITHUB_PATH=str(self.ghpath), USD_TEST_OCI_BIN=str(self.oci_fixture),
                   USD_TEST_DOCKER_LOG=str(self.log),
                   PATH=str(self.bin)+os.pathsep+os.environ['PATH'])
        env.update(extra or {})
        return subprocess.run(['bash', str(script)], env=env, capture_output=True, text=True, timeout=20)

    def test_official_oci_source_is_pinned_by_image_digest_and_binary_sha(self):
        script = SCRIPT.read_text()
        self.assertIn(OCI_REF, script)
        self.assertIn(OCI_BINARY_SHA, script)
        self.assertIn(PINNED_RELEASE_SHA, script)
        self.assertIn('sha256sum -c -', script)

    def test_download_504_falls_back_to_verified_official_oci_asset(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        folders = self.ghpath.read_text().splitlines()
        self.assertEqual(1, len(folders))
        self.assertEqual(self.oci_fixture.read_bytes(), (Path(folders[0]) / 'cosign').read_bytes())
        commands = self.log.read_text()
        self.assertIn('pull', commands)
        self.assertIn(OCI_REF, commands)
        self.assertIn('create', commands)
        self.assertIn('synthetic-oci-container:/ko-app/cosign', commands)
        self.assertIn('rm', commands)

    def test_oci_binary_checksum_mismatch_stops_without_install(self):
        result = self.run_installer(accept_fixture=False)
        self.assertNotEqual(0, result.returncode)
        self.assertEqual('', self.ghpath.read_text())
        self.assertIn('rm', self.log.read_text())

    def test_failed_oci_pull_stops_without_unsafe_fallback(self):
        result = self.run_installer(extra={'USD_TEST_PULL_FAIL':'1'})
        self.assertNotEqual(0, result.returncode)
        self.assertEqual('', self.ghpath.read_text())

    def test_environment_cannot_override_oci_pin_or_expected_hash(self):
        result = self.run_installer(accept_fixture=False, extra={
            'USD_COSIGN_OCI_IMAGE': 'evil.invalid/mutable:latest',
            'USD_COSIGN_OCI_SHA256': self.fixture_sha})
        self.assertNotEqual(0, result.returncode)
        self.assertEqual('', self.ghpath.read_text())


if __name__ == '__main__':
    unittest.main()
