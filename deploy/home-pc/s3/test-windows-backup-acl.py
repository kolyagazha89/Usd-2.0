#!/usr/bin/env python3
"""Safety tests for numeric output of Samba smbcacls."""
import importlib.util
from pathlib import Path
import unittest

script = Path(__file__).with_name("verify-windows-backup-acl.py")
spec = importlib.util.spec_from_file_location("usd_windows_acl", script)
acl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acl)

HEADER = "REVISION:1\nOWNER:S-1-5-21-1234-500\nGROUP:S-1-5-32-544\n"
ADMIN = "ACL:S-1-5-32-544:0/0x3/0x001f01ff\n"
SYSTEM = "ACL:S-1-5-18:0/0x3/0x001f01ff\n"


class BackupAclTests(unittest.TestCase):
    def test_numeric_output_as_reported_by_smbcacls(self):
        self.assertTrue(acl.validate_acl(HEADER + SYSTEM + ADMIN))

    def test_ordinary_textual_output(self):
        text = HEADER + SYSTEM.replace(":0/", ":ALLOWED/").replace("0x001f01ff", "FULL")
        text += ADMIN.replace(":0/", ":ALLOWED/").replace("0x001f01ff", "FULL")
        self.assertTrue(acl.validate_acl(text))

    def test_reject_users_group_even_with_admin_and_system(self):
        with self.assertRaises(ValueError):
            acl.validate_acl(HEADER + SYSTEM + ADMIN +
                             "ACL:S-1-5-32-545:0/0x3/0x001f01ff\n")

    def test_reject_other_principal_without_required_admin(self):
        with self.assertRaises(ValueError):
            acl.validate_acl(HEADER + SYSTEM +
                             "ACL:S-1-5-21-1234-1000:0/0x3/0x001f01ff\n")

    def test_reject_not_full_control(self):
        with self.assertRaises(ValueError):
            acl.validate_acl(HEADER + SYSTEM +
                             ADMIN.replace("0x001f01ff", "0x00120089"))

    def test_reject_non_inheritable_acl(self):
        with self.assertRaises(ValueError):
            acl.validate_acl(HEADER + SYSTEM + ADMIN.replace("0x3", "0x0"))

    def test_reject_allow_and_deny_mix(self):
        with self.assertRaises(ValueError):
            acl.validate_acl(HEADER + SYSTEM + ADMIN.replace(":0/", ":1/"))

    def test_reject_duplicate_system_ace(self):
        with self.assertRaises(ValueError):
            acl.validate_acl(HEADER + SYSTEM + SYSTEM)


if __name__ == "__main__":
    unittest.main()
