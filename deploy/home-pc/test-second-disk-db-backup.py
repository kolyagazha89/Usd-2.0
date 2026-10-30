import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

script = Path(__file__).with_name('verify-second-disk-db-backup.py')
spec = importlib.util.spec_from_file_location('usd_second_disk', script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BackupTests(unittest.TestCase):
    def test_digest_detects_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / 'first'
            second = Path(directory) / 'second'
            first.write_bytes(b'original')
            second.write_bytes(b'original')
            self.assertEqual(module.digest(first), module.digest(second))
            second.write_bytes(b'changed')
            self.assertNotEqual(module.digest(first), module.digest(second))

    def test_release_script_passes_valid_label(self):
        import re
        from pathlib import Path
        script = Path(__file__).with_name('release-approved.sh').read_text()
        self.assertIn('"release-$NEW_TAG-$(date -u +%Y%m%dT%H%M%SZ)-$"', script)
        self.assertNotIn('"release-$NEW_TAG-$(date -u +%Y%m%dT%H%M%SZ)-$"', script)
        label = 'release-' + 'a' * 40 + '-20261030T180000Z-12345'
        self.assertIsNotNone(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', label))

    def test_release_label_is_safe(self):
        import re
        pattern = r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}'
        self.assertIsNotNone(re.fullmatch(pattern, 'release-' + 'a' * 40 + '-20261030T180000Z-1234'))
        for unsafe in ('../escape', 'release/escape', '.hidden', 'a b', 'a\\\\b', 'a' * 81):
            self.assertIsNone(re.fullmatch(pattern, unsafe))

    def test_rejects_world_readable_dump(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'dump'
            source.write_bytes(b'archive')
            source.chmod(0o644)
            with patch.object(module, 'verify_mount'):
                with self.assertRaisesRegex(RuntimeError, 'root-owned and private'):
                    module.backup(source, 'safe')

if __name__ == '__main__':
    unittest.main()
