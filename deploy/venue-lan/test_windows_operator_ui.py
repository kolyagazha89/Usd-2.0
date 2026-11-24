"""USD LAN one-window operator and guarded online-stage download contracts."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent

def read(name):
    return (ROOT / name).read_text(encoding="utf-8-sig")

class WindowsOperatorUI(unittest.TestCase):
    def test_one_desktop_shortcut_and_one_operator_launcher(self):
        control = read("venue-control.ps1")
        kit = read("build-windows-kit.py")
        season = read("venue-season.ps1")
        launcher = read("USD-Control.cmd")
        self.assertIn("USD — Офлайн-сервер.lnk", control)
        self.assertIn("USD-Control.ps1", control)
        self.assertNotIn("foreach($item in @(@('USD — Офлайн'", control)
        self.assertIn("USD-Control.ps1", kit)
        self.assertIn("USD-Control.cmd", kit)
        self.assertIn("USD-Control.ps1", season)
        self.assertIn("USD-Control.cmd", season)
        self.assertIn("-STA", launcher)

    def test_panel_exposes_safe_existing_actions_with_honest_labels(self):
        panel = read("USD-Control.ps1")
        for action in ("install", "offline", "online", "export", "directory", "next", "certificate"):
            self.assertIn("'" + action + "'", panel)
        self.assertIn("Регистрации этого этапа не обновляются", panel)
        self.assertIn("https://api.usd-russia.ru", panel)
        self.assertNotIn("http://api.usd-russia.ru", panel)
        self.assertNotIn("down -v", panel)

    def test_admin_only_online_bundle_and_explicit_signature_source(self):
        panel = read("USD-Control.ps1")
        for endpoint in ("/auth/login", "/stages/venue/setup", "/stages", "/staff-export"):
            self.assertIn(endpoint, panel)
        self.assertIn("role -cne 'ADMIN'", panel)
        self.assertIn("AllowAutoRedirect=$false", panel)
        self.assertIn("UseCookies=$false", panel)
        self.assertIn("Authorization", panel)
        self.assertIn("publicKeyPem", panel)
        self.assertIn("publicKeyFingerprint", panel)
        self.assertIn("TrustedFingerprint", panel)
        self.assertIn("local-private", panel)
        self.assertIn("SetAccessRuleProtection", panel)
        self.assertNotIn("Save-Credential", panel)
        self.assertNotIn("ConvertFrom-SecureString", panel)

    def test_venue_core_accepts_pinned_authenticated_bundle(self):
        control = read("venue-control.ps1")
        season = read("venue-season.ps1")
        directory = read("venue-directory.ps1")
        for value in ("PublicKeyFile", "StaffKeyFile", "TrustedFingerprint"):
            self.assertIn(value, control)
        self.assertIn("if($StageFile)", directory)
        self.assertIn("if($StageFile)", season)
        self.assertIn("-PublicKeyFile $PublicKeyFile", season)
        self.assertIn("-StaffKeyFile $StaffKeyFile", season)
        self.assertIn("-TrustedFingerprint $TrustedFingerprint", season)

if __name__ == "__main__":
    unittest.main()
