#!/usr/bin/env python3
"""Ensure the public USD historical fixtures have no contact email exposure."""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "backend/data/historical-xlsx.json"
RAW_REGISTRATION = "USD _ Регистрация.xlsx"
EMAIL = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.IGNORECASE)


class HistoricalPrivacyTests(unittest.TestCase):
    def test_tracked_registration_workbook_is_absent(self):
        tracked = subprocess.run(
            ["git", "ls-files", "--error-unmatch", "--", RAW_REGISTRATION],
            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            check=False,
        )
        self.assertNotEqual(tracked.returncode, 0, "Raw personal-data workbook must not be tracked")

    def test_snapshot_contains_zero_email_like_values(self):
        text = SNAPSHOT.read_text(encoding="utf-8")
        self.assertIsNone(EMAIL.search(text), "Historical public JSON contains a contact email")

    def test_contact_column_is_redacted_for_all_sheets(self):
        data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))[RAW_REGISTRATION]
        self.assertEqual(len(data), 10)
        for sheet, rows in data.items():
            header = [str(label or "").strip().lower() for label in rows[0]]
            self.assertIn("email", header, sheet)
            email_index = header.index("email")
            for row in rows[1:]:
                if email_index < len(row):
                    self.assertIsNone(row[email_index], sheet)


if __name__ == "__main__":
    unittest.main()
