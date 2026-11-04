import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("verify_prerelease", Path(__file__).with_name("verify-prerelease.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SHA = "a" * 40


class FrontendAcceptanceTests(unittest.TestCase):
    HTML = b'<html><div id="root"></div><script type="module" src="/assets/index-123.js"></script><link rel="stylesheet" href="/assets/index-123.css"></html>'

    def responses(self, url, accept):
        if url.endswith('.js'):
            return 200, 'text/javascript', b'console.log("USD")'
        if url.endswith('.css'):
            return 200, 'text/css', b'body{color:white}'
        return 200, 'text/html', self.HTML

    def test_frontend_checks_main_routes_and_actual_js_and_css(self):
        with patch.object(module, "fetch", side_effect=self.responses, create=True) as fetch:
            module.verify_frontend()
        paths = [call.args[0] for call in fetch.call_args_list]
        self.assertIn('https://app.usd-russia.ru/login', paths)
        self.assertIn('https://app.usd-russia.ru/participant', paths)
        self.assertIn('https://app.usd-russia.ru/admin/inspections', paths)
        self.assertIn('https://app.usd-russia.ru/assets/index-123.js', paths)
        self.assertIn('https://app.usd-russia.ru/assets/index-123.css', paths)

    def test_spa_fallback_for_a_missing_javascript_asset_cannot_pass(self):
        with patch.object(module, "fetch", return_value=(200, 'text/html', self.HTML), create=True):
            with self.assertRaisesRegex(ValueError, 'asset'):
                module.verify_frontend()

    def test_a_frontend_without_a_built_entrypoint_cannot_pass(self):
        with patch.object(module, "fetch", return_value=(200, 'text/html', b'<h1>Maintenance</h1>'), create=True):
            with self.assertRaisesRegex(ValueError, 'frontend'):
                module.verify_frontend()

    def test_an_external_script_must_not_be_fetched(self):
        html = self.HTML.replace(b'/assets/index-123.js', b'https://usd-russia.ru/assets/other.js')
        with patch.object(module, "fetch", return_value=(200, 'text/html', html), create=True) as fetch:
            with self.assertRaises(ValueError):
                module.verify_frontend()
        self.assertEqual(fetch.call_count, 1)

    def test_network_targets_are_allowlisted_before_connecting(self):
        for url in ('https://usd-russia.ru/', 'http://app.usd-russia.ru/', 'https://api.usd-russia.ru.evil.test/', 'https://user:pass@api.usd-russia.ru/'):
            with self.subTest(url=url), patch.object(module.urllib.request, 'build_opener') as opener:
                with self.assertRaises(ValueError):
                    module.fetch(url, 'application/json')
                opener.assert_not_called()

    def test_redirect_to_main_domain_is_rejected_before_following_it(self):
        handler = module.PrereleaseRedirectHandler()
        req = module.urllib.request.Request('https://app.usd-russia.ru/')
        with self.assertRaises(ValueError):
            handler.redirect_request(req, None, 302, 'Found', {}, 'https://usd-russia.ru/')


class VerifyReleaseTests(unittest.TestCase):
    def setUp(self):
        self.protected = patch.object(module, "get_status", return_value=401, create=True)
        self.assets = patch.object(module, "verify_frontend", create=True)
        self.protected.start()
        self.assets.start()
        self.addCleanup(self.protected.stop)
        self.addCleanup(self.assets.stop)

    def test_rejects_missing_or_malformed_public_application_data(self):
        valid = [{"revision": SHA}, {"revision": SHA}, {"settings": {}}, [], []]
        for index, invalid in [(2, {}), (2, {"settings": []}), (3, {}), (4, {})]:
            with self.subTest(index=index, invalid=invalid):
                values = list(valid)
                values[index] = invalid
                with patch.object(module, "get_json", side_effect=values):
                    with self.assertRaisesRegex(ValueError, "application data"):
                        module.verify(SHA)

    def test_rejects_accessible_private_routes_without_sending_credentials(self):
        for status in (200, 302, 404, 500):
            with self.subTest(status=status):
                with patch.object(module, "get_json", side_effect=[{"revision": SHA}, {"revision": SHA}, {"settings": {}}, [], []]), patch.object(module, "get_status", return_value=status):
                    with self.assertRaisesRegex(ValueError, "protected"):
                        module.verify(SHA)

    def test_requires_exact_deployed_revision_and_working_public_api(self):
        with patch.object(module, "get_json", side_effect=[{"revision": SHA}, {"revision": SHA}, {"settings": {}}, [], []]) as get:
            module.verify(SHA)
        self.assertEqual(get.call_count, 5)
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



class SafeRevisionDiagnosticsTests(unittest.TestCase):
    def test_mismatch_shows_only_commit_prefixes_and_identifies_ingress(self):
        with self.assertRaisesRegex(ValueError,'observed='+('b'*12)) as error:
            module.require_revision({'revision':'b'*40},'a'*40,'frontend')
        self.assertIn('ingress',str(error.exception))
        self.assertNotIn('b'*40,str(error.exception))

    def test_arbitrary_response_cannot_write_private_values_to_release_log(self):
        for value in ('SECRET_KEY_DO_NOT_LOG','https://not-our-app.test',None,[],{'password':'password'}):
            with self.subTest(value=value):
                with self.assertRaises(ValueError) as error:
                    module.require_revision({'revision':value},'a'*40,'API')
                self.assertIn('missing-or-invalid',str(error.exception))
                self.assertNotIn('SECRET_KEY_DO_NOT_LOG',str(error.exception))
                self.assertNotIn('password',str(error.exception))

    def test_exact_revision_passes_without_logging(self):
        module.require_revision({'revision':'a'*40},'a'*40,'frontend')


class PublicMediaAcceptanceTests(unittest.TestCase):
    PNG = b'\x89PNG\r\n\x1a\n' + b'content'

    def test_checks_public_site_asset_bytes_without_credentials(self):
        settings = {
            'branding': {'logoUrl': 'https://cdn.example/logo.svg'},
            'homepage': {'stagePosters': {
                'one': 'https://api.usd-russia.ru/media/public-file/SITE_ASSET/stage-poster-one',
                'two': '/media/public-file/SITE_ASSET/stage-poster-two',
            }},
        }
        with patch.object(module, 'fetch', return_value=(200, 'image/png', self.PNG)) as get:
            self.assertEqual(module.verify_public_image_assets(settings), 2)
        self.assertEqual(get.call_count, 2)
        self.assertTrue(all(c.args[0].startswith(module.API + '/media/') for c in get.call_args_list))
        self.assertTrue(all(c.args[1].startswith('image/') for c in get.call_args_list))

    def test_failed_media_bytes_or_404_block_acceptance(self):
        poster = {'homepage': {'stagePosters': {'one':
            module.API + '/media/public-file/SITE_ASSET/stage-poster-test'}}}
        for reply in [
            (200, 'text/html', b'<html>SPA fallback</html>'),
            (200, 'image/png', b'not actually a PNG'),
            (404, 'application/json', b'{}'),
        ]:
            with self.subTest(reply=reply[:2]):
                with patch.object(module, 'fetch', return_value=reply) as get:
                    with self.assertRaisesRegex(ValueError, 'stage poster'):
                        module.verify_public_image_assets(poster)
                self.assertEqual(get.call_count, 1)

    def test_transient_storage_read_is_retried_once_and_must_recover(self):
        poster = {'homepage': {'stagePosters': {'one':
            module.API + '/media/public-file/SITE_ASSET/stage-poster-test'}}}
        with patch.object(module, 'fetch', side_effect=[
            OSError('disconnected'), (200, 'image/webp', b'RIFF1234WEBPdata'),
        ]) as get:
            self.assertEqual(module.verify_public_image_assets(poster), 1)
            self.assertEqual(get.call_count, 2)
        with patch.object(module, 'fetch', side_effect=OSError('still down')) as get:
            with self.assertRaisesRegex(ValueError, 'unavailable'):
                module.verify_public_image_assets(poster)
            self.assertEqual(get.call_count, 2)

    def test_does_not_fetch_primary_site_or_untrusted_or_private_links(self):
        settings = {'homepage': {'stagePosters': {
            'primary': 'https://usd-russia.ru/media/public-file/SITE_ASSET/a',
            'evil': 'https://api.usd-russia.ru.attacker.test/media/public-file/SITE_ASSET/a',
            'private': 'https://api.usd-russia.ru/media/private-file/SITE_ASSET/a',
            'nonasset': 'https://api.usd-russia.ru/records/current',
        }}}
        with patch.object(module, 'fetch') as get:
            self.assertEqual(module.verify_public_image_assets(settings), 0)
            get.assert_not_called()

    def test_samples_newest_published_stages_before_old_cms_ids(self):
        poster = module.API + '/media/public-file/SITE_ASSET/'
        settings = {'homepage': {'stagePosters': {
            'old': poster + 'old', 'upcoming': poster + 'upcoming',
            'recent': poster + 'recent', 'early': poster + 'early',
        }}}
        stages = [
            {'id': 'old', 'date': '2020-01-01T00:00:00Z'},
            {'id': 'recent', 'date': '2026-09-12T00:00:00Z'},
            {'id': 'early', 'date': '2025-05-03T00:00:00Z'},
            {'id': 'upcoming', 'date': '2026-11-21T00:00:00Z'},
        ]
        with patch.object(module, 'fetch', return_value=(200, 'image/png', self.PNG)) as get:
            self.assertEqual(module.verify_public_image_assets(settings, stages), 3)
        self.assertEqual(
            [call.args[0] for call in get.call_args_list],
            [poster + 'upcoming', poster + 'recent', poster + 'early'],
        )

    def test_samples_at_most_three_unique_stage_posters(self):
        posters = {
            str(i): module.API + '/media/public-file/SITE_ASSET/poster-' + str(i)
            for i in range(20)
        }
        with patch.object(module, 'fetch', return_value=(200, 'image/png', self.PNG)) as get:
            self.assertEqual(module.verify_public_image_assets({'homepage': {'stagePosters': posters}}), 3)
        self.assertEqual(get.call_count, 3)


if __name__ == '__main__':
    unittest.main()
