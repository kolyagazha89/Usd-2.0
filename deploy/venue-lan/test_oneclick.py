"""Contract for one-click Windows operator; no Docker/Windows necessary for tests."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parent

class VenueLauncherContracts(unittest.TestCase):
    def test_three_double_click_entrypoints_exist_and_route_to_powershell(self):
        for name,action in [
            ("USD-Install.cmd","install"),("USD-Offline.cmd","offline"),
            ("USD-Online.cmd","online"),
        ]:
            source=(ROOT/name).read_text(encoding="utf-8")
            self.assertIn("venue-control.ps1",source)
            self.assertIn("-Action "+action,source)
            self.assertNotIn("down -v",source)
    def test_install_is_replay_safe_and_gates_central_sync(self):
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8")
        for expected in (
            "setup-state.json","VENUE_STAGE_ID","VENUE_SIGNING_KEY_FINGERPRINT",
            "verify-stage-package.mjs","import-stage.mjs","install-journal.sql",
            "provision-rustfs.mjs","provision-staff.mjs",
            "USD_VENUE_LAN_MODE","docker","compose","https://app.usd-russia.ru",
            "stop","Get-NetIPAddress",
        ):
            self.assertIn(expected,source)
        self.assertNotIn("down -v",source)
        self.assertNotIn("prune",source)
        self.assertNotIn("return-sync",source)
        self.assertNotIn("rm -rf",source)
        self.assertNotIn("usd-home",source)
        self.assertRegex(source,r"function\s+Set-SetupPhase")
        self.assertRegex(source,r"function\s+Ensure-DockerReady")
    def test_real_contest_requires_independently_verified_public_fingerprint(self):
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8")
        self.assertIn("Read-VenueFingerprint",source)
        self.assertIn("trusted fingerprint",source.lower())
        self.assertIn("Get-RandomSecret",source)
        self.assertNotIn("VENUE_S3_ROOT_SECRET=rustfsadmin",source)
        self.assertNotIn("VENUE_JWT_SECRET=REPLACE_",source)
    def test_back_online_never_automatically_imports_or_deletes_offline_data(self):
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8")
        offline=source.index("function Start-Local")
        online=source.index("function Return-Online")
        self.assertLess(offline,online)
        section=source[online:]
        self.assertRegex(section,r"(?i)\bstop\b")
        self.assertNotIn(" down ",section)
        self.assertNotIn("rm -",section)
        self.assertIn("unsynced",section.lower())

if __name__=="__main__":
    unittest.main()
