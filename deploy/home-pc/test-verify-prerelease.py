import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("verify_prerelease", Path(__file__).with_name("verify-prerelease.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SHA = "a" * 40


class VerifyReleaseTests(unittest.TestCase):
    def test_requires_exact_deployed_revision_and_working_public_api(self):
        with patch.object(module, "get_json", side_effect=[{"revision": SHA}, {"revision": SHA}, {}, []]) as get:
            module.verify(SHA)
        self.assertEqual(get.call_count, 4)
        self.assertTrue(all("usd-russia.ru" in c.args[0] for c in get.call_args_list))
        self.assertTrue(all("https://usd-russia.ru/" not in c.args[0] for c in get.call_args_list))

    def test_stale_frontend_never_counts_as_a_deployment(self):
        with patch.object(module, "get_json", return_value={"revision": "b" * 40}):
            with self.assertRaisesRegex(ValueError, "revision"):
                module.verify(SHA)

    def test_api_failure_cannot_be_hidden_by_a_new_frontend(self):
        with patch.object(module, "get_json", side_effect=[{"revision": SHA}, OSError("unreachable")]):
            with self.assertRaises(OSError):
                module.verify(SHA)

    def test_public_api_must_be_the_same_revision(self):
        with patch.object(module, "get_json", side_effect=[{"revision": SHA}, {"revision": "b" * 40}]):
            with self.assertRaisesRegex(ValueError, "API revision"):
                module.verify(SHA)

    def test_refuses_invalid_commit_before_network_access(self):
        with patch.object(module, "get_json") as get:
            with self.assertRaises(ValueError):
                module.verify("main")
        get.assert_not_called()


if __name__ == "__main__":
    unittest.main()
