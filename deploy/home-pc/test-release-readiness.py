#!/usr/bin/env python3
"""Offline checks for the read-only release readiness report."""
import importlib.util
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).with_name("release-readiness.py")
spec = importlib.util.spec_from_file_location("usd_release_readiness", MODULE)
readiness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(readiness)


class ReadinessTests(unittest.TestCase):
    def test_missing_or_untrusted_signature_tools_block_readiness(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "usr/local/libexec/usd-cosign"
            path.parent.mkdir(parents=True)
            path.write_text("unreviewed binary")
            path.chmod(0o777)
            with patch.object(readiness.shutil, "which", return_value="/usr/bin/tool"):
                result = readiness.assess(root)
            tools = [item for item in result["checks"] if item["name"].startswith("signature-tool:")]
            self.assertEqual(len(tools), 2)
            self.assertTrue(all(not item["ok"] for item in tools))
            self.assertNotIn("unreviewed binary", json.dumps(result))

    def test_missing_configuration_fails_closed_without_creating_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch.object(readiness.shutil, "which", return_value="/usr/bin/tool"):
                result = readiness.assess(root)
            self.assertFalse(result["ready"])
            self.assertTrue(all(not x["ok"] for x in result["checks"] if x["name"].startswith("policy:")))
            self.assertEqual(list(root.iterdir()), [])

    def test_symlink_and_world_writable_policy_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "etc/usd-auto-release-schema"
            path.parent.mkdir(parents=True)
            path.write_text("a" * 40)
            path.chmod(0o666)
            self.assertFalse(readiness.check_private_file(root, "etc/usd-auto-release-schema")[0])
            path.unlink()
            path.symlink_to("/etc/passwd")
            self.assertFalse(readiness.check_private_file(root, "etc/usd-auto-release-schema")[0])

    def test_private_policy_disallows_group_read(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "etc/usd-deployer/media-backup.conf"
            path.parent.mkdir(parents=True)
            path.write_text("local:media\noffsite:backup\n")
            path.chmod(0o640)
            self.assertFalse(readiness.check_private_file(root, "etc/usd-deployer/media-backup.conf", require_private=True)[0])

    def test_distinct_offsite_remotes_required(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "etc/usd-deployer/media-backup.conf"
            path.parent.mkdir(parents=True)
            path.write_text("local:media\nlocal:backup\n")
            with patch.object(readiness.shutil, "which", return_value="/usr/bin/tool"):
                result = readiness.assess(root)
            item = next(x for x in result["checks"] if x["name"] == "media-offhost-policy")
            self.assertFalse(item["ok"])
            path.write_text("local:media\noffsite:backup\n")
            with patch.object(readiness.shutil, "which", return_value="/usr/bin/tool"):
                result = readiness.assess(root)
            item = next(x for x in result["checks"] if x["name"] == "media-offhost-policy")
            self.assertTrue(item["ok"])

    def test_json_report_has_no_policy_contents_or_secrets(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "etc/usd-deployer/media-backup.conf"
            path.parent.mkdir(parents=True)
            path.write_text("local:private-secret-media\noffsite:private-secret-backup\n")
            with patch.object(readiness.shutil, "which", return_value=None):
                report = readiness.assess(root)
            self.assertNotIn("private-secret", json.dumps(report))
            self.assertFalse(report["ready"])

    def test_live_rejected_for_synthetic_root(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(SystemExit) as raised:
                readiness.main(["--root", folder, "--live"])
            self.assertEqual(raised.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
