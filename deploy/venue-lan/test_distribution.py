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
            demo = Path(directory) / "demo"
            # Real execution from the downloaded kit proves all module dependencies
            # are included. No repository, npm, DB, Docker or Internet is used.
            result = subprocess.run(["node", str(extracted / "make-demo-stage.mjs"), str(demo)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run(["node", str(extracted / "verify-stage-package.mjs"), str(demo / "usd-venue-demo-stage.json"), str(demo / "signing-public.pem")], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            for filename in (".env", "setup-state.json", "signing-private.pem"):
                self.assertFalse((extracted / filename).exists())
            self.assertIn("provision-existing-staff.mjs", kit.FILES)
            self.assertNotIn("venue-staff-access.key", kit.FILES)

    def test_instruction_is_self_contained_and_truthful(self):
        html = (kit.OUTPUT / "USD-Offline-Guide.html").read_text()
        self.assertNotIn('<script', html)
        self.assertNotIn('src="http', html)
        self.assertIn('72 часа', html)
        self.assertIn('не отправ', html.replace('а не отправ', 'не отправ'))
        self.assertIn('Ctrl + P', html)
        self.assertIn('USD-Venue-CA.crt', html)

if __name__ == "__main__":
    unittest.main()
