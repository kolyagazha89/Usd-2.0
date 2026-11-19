#!/usr/bin/env python3
"""Regression for Windows installer invoking *real* Docker Compose CLI verbs."""
import pathlib
import re
import shutil
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parent


class WindowsComposeCliTests(unittest.TestCase):
    def test_media_volume_create_flags_exist_in_real_compose_cli(self):
        source = (ROOT / "venue-season.ps1").read_text(encoding="utf-8-sig")
        block = source.split("function Initialize-VenueMediaVolume {", 1)[1].split(
            "function Get-VenueKitFiles {", 1
        )[0]
        command = re.search(
            r"Invoke-Compose\s+@\(([^)]*)\)\s+'prepare own media volume'",
            block,
        )
        self.assertIsNotNone(command, "missing actual media volume create command")
        args = re.findall(r"'([^']*)'", command.group(1))
        self.assertEqual(args[0], "create")
        self.assertEqual(args[-1], "rustfs")

        if not shutil.which("docker"):
            self.skipTest("Docker Compose CLI unavailable; CI has Docker Compose")
        output = subprocess.run(
            ["docker", "compose", "create", "--help"],
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        ).stdout
        supported = set(re.findall(r"(?<![\w-])--[a-z][a-z-]*", output))
        for flag in (argument for argument in args[1:-1] if argument.startswith("--")):
            self.assertIn(flag, supported, f"unsupported docker compose create flag {flag}")


if __name__ == "__main__":
    unittest.main()
