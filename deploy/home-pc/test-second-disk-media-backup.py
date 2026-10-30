import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

script = Path(__file__).with_name("verify-second-disk-media-backup.py")
spec = importlib.util.spec_from_file_location("usd_media_snapshot", script)
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)

class MediaBackupTests(unittest.TestCase):
    def test_detects_corruption(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "object"
            path.write_bytes(b"old")
            before = media.digest(path)
            path.write_bytes(b"new")
            self.assertNotEqual(before, media.digest(path))

    def test_rejects_invalid_label_before_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "data").mkdir()
            (root / "data" / "file").write_bytes(b"media")
            with patch.object(media, "MOUNT", root), patch.object(media, "SOURCE", root / "data"), patch.object(media, "DEST", root / "backups" / "rustfs"), patch.object(media.os, "geteuid", return_value=0), patch.object(media.subprocess, "check_output", return_value="/dev/sdb1"):
                with self.assertRaisesRegex(RuntimeError, "invalid snapshot label"):
                    media.run("../escape")

if __name__ == "__main__":
    unittest.main()
