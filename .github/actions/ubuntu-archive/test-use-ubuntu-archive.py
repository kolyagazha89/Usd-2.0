#!/usr/bin/env python3
"""Offline rewrite and hosted-runner boundary tests; no system files touched."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('archive', Path(__file__).with_name('use-ubuntu-archive.py'))
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)
HOSTED = {'GITHUB_ACTIONS': 'true', 'RUNNER_ENVIRONMENT': 'github-hosted', 'RUNNER_OS': 'Linux'}


class ArchiveMirrorTests(unittest.TestCase):
    def test_replaces_only_azure_archive_and_preserves_options_and_other_mirrors(self):
        before = (b'# http://azure.archive.ubuntu.com/ubuntu/ comment\r\n'
                  b'http://azure.archive.ubuntu.com/ubuntu/ priority:1\r\n'
                  b'  https://azure.archive.ubuntu.com/ubuntu priority:2\n'
                  b'https://security.ubuntu.com/ubuntu/ priority:3\n'
                  b'https://archive.ubuntu.com/ubuntu/\n'
                  b'https://azure.archive.ubuntu.com.example.org/ubuntu/\n'
                  b'https://example.org/azure.archive.ubuntu.com/ubuntu/\n')
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'mirrors'
            path.write_bytes(before)
            path.chmod(0o640)
            self.assertTrue(archive.rewrite(path, HOSTED))
            expected = before.replace(b'http://azure.archive.ubuntu.com/ubuntu/ priority:1',
                                      b'http://archive.ubuntu.com/ubuntu/ priority:1').replace(
                                          b'https://azure.archive.ubuntu.com/ubuntu priority:2',
                                          b'https://archive.ubuntu.com/ubuntu priority:2')
            self.assertEqual(path.read_bytes(), expected)
            self.assertEqual(path.stat().st_mode & 0o777, 0o640)
            self.assertFalse(archive.rewrite(path, HOSTED))

    def test_rejects_non_hosted_or_non_linux_execution_before_any_write(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'mirrors'
            original = b'http://azure.archive.ubuntu.com/ubuntu/\n'
            path.write_bytes(original)
            for environment in ({}, {**HOSTED, 'GITHUB_ACTIONS': 'false'},
                                {**HOSTED, 'RUNNER_ENVIRONMENT': 'self-hosted'},
                                {**HOSTED, 'RUNNER_OS': 'Windows'}):
                with self.subTest(environment=environment):
                    with self.assertRaises(ValueError):
                        archive.rewrite(path, environment)
                    self.assertEqual(path.read_bytes(), original)

    def test_absent_list_is_noop_and_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'mirrors'
            self.assertFalse(archive.rewrite(path, HOSTED))
            source = Path(root) / 'source'
            source.write_bytes(b'http://azure.archive.ubuntu.com/ubuntu/\n')
            path.symlink_to(source)
            with self.assertRaises(ValueError):
                archive.rewrite(path, HOSTED)
            self.assertEqual(source.read_bytes(), b'http://azure.archive.ubuntu.com/ubuntu/\n')


if __name__ == '__main__':
    unittest.main()
