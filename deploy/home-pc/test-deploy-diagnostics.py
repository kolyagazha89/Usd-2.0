import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'deploy_diagnostics', Path(__file__).with_name('deploy-diagnostics.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
A, B, C = 'a' * 40, 'b' * 40, 'c' * 40


class DeployDiagnosticsTests(unittest.TestCase):
    def test_public_release_already_current_requires_no_schema_lookup(self):
        with patch.object(module, 'public_revision', side_effect=[A, A]), patch.object(module, 'prisma_tree') as tree:
            result = module.diagnose(A)
        self.assertEqual(result['classification'], 'public_revision_current')
        tree.assert_not_called()

    def test_schema_drift_is_not_authorized_for_auto_release(self):
        with patch.object(module, 'public_revision', side_effect=[A, A]), patch.object(module, 'prisma_tree', side_effect=[B, C]):
            result = module.diagnose(C)
        self.assertTrue(result['schema_changed'])
        self.assertEqual(result['classification'], 'schema_change_requires_supervised_review')

    def test_unchanged_schema_still_requires_host_diagnosis(self):
        with patch.object(module, 'public_revision', side_effect=[A, A]), patch.object(module, 'prisma_tree', side_effect=[B, B]):
            result = module.diagnose(C)
        self.assertFalse(result['schema_changed'])
        self.assertEqual(result['classification'], 'same_schema_deploy_failed_check_host_service')

    def test_mixed_live_revisions_refuse_schema_assumptions(self):
        with patch.object(module, 'public_revision', side_effect=[A, B]), patch.object(module, 'prisma_tree') as tree:
            result = module.diagnose(C)
        self.assertEqual(result['classification'], 'mixed_public_revisions')
        tree.assert_not_called()

    def test_target_and_live_revision_must_be_full_sha(self):
        for value in ('main', '', 'A' * 40, '../release', A + '/refs'):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, 'SHA'):
                    module.diagnose(value)
        with patch.object(module, 'get_json', return_value={'revision': 'latest'}):
            with self.assertRaisesRegex(ValueError, 'revision'):
                module.public_revision(module.APP, '/usd-release.json')

    def test_git_tree_walk_picks_backend_and_prisma_only(self):
        values = [
            {'tree': {'sha': A}},
            {'tree': [{'path': 'backend', 'type': 'tree', 'sha': B},
                      {'path': 'frontend', 'type': 'tree', 'sha': C}]},
            {'tree': [{'path': 'prisma', 'type': 'tree', 'sha': C}]},
        ]
        with patch.object(module, 'get_json', side_effect=values) as fetch:
            self.assertEqual(module.prisma_tree(A), C)
        self.assertEqual([call.args[0] for call in fetch.call_args_list], [
            module.REPO_API + '/git/commits/' + A,
            module.REPO_API + '/git/trees/' + A,
            module.REPO_API + '/git/trees/' + B,
        ])

    def test_missing_subtree_and_malformed_response_fail_closed(self):
        for bad in ({'tree': []}, {'tree': None}, {'tree': [{'path': 'prisma', 'type': 'blob', 'sha': B}]}):
            with self.subTest(bad=bad), patch.object(module, 'get_json', side_effect=[{'tree': {'sha': A}}, bad]):
                with self.assertRaisesRegex(ValueError, 'Missing'):
                    module.prisma_tree(A)

    def test_readonly_url_allowlist_prevents_primary_domain_and_non_https(self):
        urls = ('https://usd-russia.ru/', 'http://app.usd-russia.ru/usd-release.json',
                'https://api.usd-russia.ru.evil.test/release',
                'https://user:pass@app.usd-russia.ru/usd-release.json',
                'https://app.usd-russia.ru/admin', 'https://api.usd-russia.ru/health',
                'https://api.github.com/repos/another/repo/git/commits/' + A)
        for url in urls:
            with self.subTest(url=url), patch.object(module.urllib.request, 'build_opener') as opener:
                with self.assertRaises(ValueError):
                    module.get_json(url)
                opener.assert_not_called()

    def test_cross_origin_redirect_to_primary_site_is_refused(self):
        handler = module.SameOriginRedirects()
        req = module.urllib.request.Request(module.APP + '/usd-release.json')
        with self.assertRaisesRegex(ValueError, 'Cross-origin'):
            handler.redirect_request(req, None, 302, 'Found', {}, 'https://usd-russia.ru/')

    def test_separate_hosted_triage_retains_runner_privilege_boundary(self):
        workflow = (Path(__file__).parents[2] / '.github/workflows/request-home-pc-deploy.yml').read_text()
        hosted = (Path(__file__).parents[2] / '.github/workflows/failed-home-pc-deploy-triage.yml').read_text()
        self.assertIn('sudo -n /usr/bin/systemctl start usd-auto-deploy.service', workflow)
        self.assertNotIn('actions/checkout', workflow)
        self.assertNotIn('secrets.', workflow)
        self.assertIn('systemctl show usd-auto-deploy.service', workflow)
        self.assertIn('grep -E', workflow)
        self.assertIn('runs-on: ubuntu-latest', hosted)
        self.assertNotIn('self-hosted', hosted.split('jobs:', 1)[-1])
        self.assertIn('persist-credentials: false', hosted)
        self.assertIn('deploy-diagnostics.py --target', hosted)


if __name__ == '__main__':
    unittest.main()
