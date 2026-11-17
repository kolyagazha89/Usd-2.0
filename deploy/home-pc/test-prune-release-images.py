#!/usr/bin/env python3
"""Regression checks for conservative post-release image cleanup."""
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name("prune-release-images.sh")
A = "a" * 40
B = "b" * 40
C = "c" * 40
D = "d" * 40


class PruneReleaseImagesTests(unittest.TestCase):
    def run_case(self, images, active=A, previous=B, fail_remove=False):
        with tempfile.TemporaryDirectory() as tmp:
            log = pathlib.Path(tmp, "removed")
            docker = pathlib.Path(tmp, "docker")
            docker.write_text("""#!/usr/bin/env bash
if [[ "$1" == image && "$2" == ls ]]; then
  printf '%s\\n' "$USD_TEST_IMAGES"
elif [[ "$1" == image && "$2" == rm ]]; then
  printf '%s\\n' "$4" >> "$USD_TEST_REMOVED"
  [[ "$USD_TEST_FAIL_REMOVE" != 1 ]]
else
  exit 3
fi
""")
            docker.chmod(0o755)
            import os
            env = dict(os.environ, USD_TEST_IMAGES="\n".join(images),
                       USD_TEST_REMOVED=str(log),
                       USD_TEST_FAIL_REMOVE="1" if fail_remove else "0",
                       PATH=tmp + ":" + os.environ["PATH"])
            result = subprocess.run(["bash", str(SCRIPT), active, previous],
                                    env=env, text=True, capture_output=True)
            removed = log.read_text().splitlines() if log.exists() else []
            return result, removed

    def test_preserves_live_and_rollback_pairs(self):
        base = "ghcr.io/kolyagazha89/usd-2.0-"
        images = [f"{base}{service}:{sha}" for service in ("api", "frontend")
                  for sha in (A, B, C)]
        result, removed = self.run_case(images)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(sorted(removed), sorted([f"{base}{service}:{C}"
                                                  for service in ("api", "frontend")]))

    def test_never_removes_other_repositories_or_non_sha_tags(self):
        base = "ghcr.io/kolyagazha89/usd-2.0-"
        images = [f"{base}api:latest", f"{base}frontend:stable",
                  f"ghcr.io/another/usd-2.0-api:{C}", f"postgres:{C}",
                  f"{base}api:{C}", "<none>:<none>"]
        result, removed = self.run_case(images)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(removed, [f"{base}api:{C}"])

    def test_requires_two_distinct_valid_protected_shas(self):
        for active, previous in ((A, A), ("latest", B), (A, "bad")):
            result, removed = self.run_case([f"ghcr.io/kolyagazha89/usd-2.0-api:{C}"],
                                            active, previous)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(removed, [])

    def test_failed_removal_is_reported(self):
        result, _ = self.run_case([f"ghcr.io/kolyagazha89/usd-2.0-api:{C}"],
                                  fail_remove=True)
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
