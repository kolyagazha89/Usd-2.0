from pathlib import Path
import importlib.util
import json
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("kit", ROOT / "build-windows-kit.py")
kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kit)

class WindowsDistribution(unittest.TestCase):
    def test_committed_downloads_are_exact_reproducible_source(self):
        for name, expected in kit.build().items():
            self.assertEqual((kit.OUTPUT / name).read_bytes(), expected, name)

    def test_archive_is_allowlisted_and_extracts_without_repo_or_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            with zipfile.ZipFile(kit.OUTPUT / "USD-Offline-Windows.zip") as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(set(archive.namelist()), {"USD-Offline-Windows/" + f for f in kit.FILES})
                self.assertTrue(all(".." not in n and not n.startswith("/") for n in archive.namelist()))
                archive.extractall(directory)
            extracted = Path(directory) / "USD-Offline-Windows"
            # Verify all shipped entrypoints parse without network access.
            self.assertNotIn("make-demo-stage.mjs", kit.FILES)
            self.assertNotIn("provision-staff.mjs", kit.FILES)
            self.assertIn("USD-Next-Stage.cmd", kit.FILES)
            self.assertIn("USD-Control.cmd", kit.FILES)
            self.assertIn("USD-Control.ps1", kit.FILES)
            self.assertIn("venue-season.ps1", kit.FILES)
            self.assertIn("venue-judge-permissions.mjs", kit.FILES)
            for module in extracted.glob("*.mjs"):
                result = subprocess.run(["node", "--check", str(module)], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, f"{module.name}: {result.stderr}")
            for filename in (".env", "setup-state.json", "signing-private.pem"):
                self.assertFalse((extracted / filename).exists())
            self.assertIn("provision-existing-staff.mjs", kit.FILES)
            self.assertNotIn("venue-staff-access.key", kit.FILES)

    def test_instruction_is_self_contained_and_truthful(self):
        html = (kit.OUTPUT / "USD-Offline-Guide.html").read_text()
        self.assertNotIn('<script', html)
        self.assertNotIn('src="http', html)
        self.assertIn('72 часа', html)
        self.assertIn('не отправляйте файлы судей посторонним.', html.casefold())
        self.assertIn('Ctrl + P', html)
        self.assertIn('USD-Venue-CA.crt', html)

if __name__ == "__main__":
    unittest.main()
