import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("prepare_host_files", Path(__file__).with_name("prepare-host-files.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class HostFilesTests(unittest.TestCase):
    def test_only_known_baseline_or_current_compose_is_accepted(self):
        self.assertTrue(module.needs_upgrade(b"old", b"new", b"old"))
        self.assertFalse(module.needs_upgrade(b"new", b"new", b"old"))
        with self.assertRaises(ValueError):
            module.needs_upgrade(b"operator customization", b"new", b"old")

    def test_only_reviewed_compose_files_are_accepted(self):
        module.validate_running_config_files('/srv/compose.yaml,/srv/compose.local.yaml')
        with self.assertRaisesRegex(ValueError, 'Unsupported active ingress overlay'):
            module.validate_running_config_files('/srv/compose.yaml,/srv/compose.unknown.yaml')
        with self.assertRaisesRegex(ValueError, 'no known base'):
            module.validate_running_config_files('/srv/compose.local.yaml')


if __name__ == '__main__':
    unittest.main()
