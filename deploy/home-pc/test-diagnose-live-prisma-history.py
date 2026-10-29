#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import unittest

source = Path(__file__).with_name("diagnose-live-prisma-history.py")
spec = importlib.util.spec_from_file_location("usd_history", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MigrationHistoryDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.expected = {"old_migration": "a"*64,
                         "20261028150000_participant_usd_id": "b"*64,
                         "20261028172000_configuration_catalog_entry_ids": "c"*64}
        self.good = {"migration_name": "old_migration", "checksum": "a"*64,
                     "finished": True, "rolled_back": False}

    def test_clean_baseline(self):
        found = module.classify([self.good], self.expected)
        self.assertEqual(found["reviewed_pending"], sorted(module.REVIEWED))
        self.assertFalse(found["missing_preexisting"])
        self.assertFalse(found["unknown"])

    def test_unknown_failed_duplicate_checksum_all_reported(self):
        rows = [self.good, dict(self.good), dict(self.good, checksum="x"*64),
                dict(self.good, migration_name="unexpected_migration", finished=False)]
        result = module.classify(rows, self.expected)
        self.assertIn("old_migration", result["duplicates"])
        self.assertIn("old_migration", result["checksum_mismatch"])
        self.assertIn("unexpected_migration", result["unknown"])
        self.assertIn("unexpected_migration", result["unfinished"])

    def test_rolled_back_attempt_not_treated_as_active(self):
        rows = [dict(self.good, migration_name="obsolete", finished=False, rolled_back=True), self.good]
        result = module.classify(rows, self.expected)
        self.assertEqual(result["rolled_back_attempts"], ["obsolete"])
        self.assertFalse(result["unknown"])

    def test_missing_older_migration_is_unsafe(self):
        self.expected["missing_old"] = "d"*64
        result = module.classify([self.good], self.expected)
        self.assertEqual(result["missing_preexisting"], ["missing_old"])


if __name__ == "__main__":
    unittest.main()
