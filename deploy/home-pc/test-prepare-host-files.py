import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("prepare_host_files", Path(__file__).with_name("prepare-host-files.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class HostFilesTests(unittest.TestCase):
    def test_only_known_baseline_or_current_compose_is_accepted(self):
        self.assertTrue(module.needs_upgrade(b"old", b"new", b"old"))
        self.assertFalse(module.needs_upgrade(b"new", b"new", b"old"))
        with self.assertRaises(ValueError):
            module.needs_upgrade(b"operator customization", b"new", b"old")

    def test_isolates_existing_token_and_preserves_application_settings(self):
        shared = 'APP_DOMAIN=app.usd-russia.ru\nCLOUDFLARE_TUNNEL_TOKEN="private-token"\nDATABASE_URL=unchanged\n'
        clean, private = module.isolate_tunnel(shared, None)
        self.assertEqual(clean, 'APP_DOMAIN=app.usd-russia.ru\nDATABASE_URL=unchanged\n')
        self.assertEqual(private, 'TUNNEL_TOKEN=private-token\n')

    def test_existing_matching_private_token_is_idempotent(self):
        shared = 'TUNNEL_TOKEN=private-token\nOTHER=value\n'
        self.assertEqual(module.isolate_tunnel(shared, 'TUNNEL_TOKEN=private-token\n'), ('OTHER=value\n', 'TUNNEL_TOKEN=private-token\n'))

    def test_conflicting_tokens_refuse_before_any_file_write(self):
        for shared, private in [('TUNNEL_TOKEN=a\n', 'TUNNEL_TOKEN=b\n'),
                                ('TUNNEL_TOKEN=a\nCLOUDFLARE_TUNNEL_TOKEN=b\n', None)]:
            with self.subTest(shared=shared), self.assertRaises(ValueError):
                module.isolate_tunnel(shared, private)

    def test_no_tunnel_does_not_create_a_credential_file(self):
        self.assertEqual(module.isolate_tunnel('APP_DOMAIN=app.usd-russia.ru\n', None), ('APP_DOMAIN=app.usd-russia.ru\n', None))


if __name__ == '__main__':
    unittest.main()
