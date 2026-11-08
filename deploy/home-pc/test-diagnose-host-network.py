import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('host_network', Path(__file__).with_name('diagnose-host-network.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class HostNetworkTests(unittest.TestCase):
    def test_only_fixed_https_targets_and_bounded_subprocesses(self):
        with patch.object(probe.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '200', 'secret-error')) as run:
            for target in probe.TARGETS:
                result = probe.probe_http(target)
                self.assertNotIn('secret', json.dumps(result))
                args, kwargs = run.call_args
                self.assertEqual(args[0][-1], target[1])
                self.assertEqual(args[0][:2], ['curl', '-q'], 'default curl configuration must be disabled first')
                self.assertTrue(target[1].startswith('https://'))
                self.assertEqual(kwargs['timeout'], 15)
                self.assertFalse(kwargs.get('shell', False))

    def test_subprocesses_do_not_inherit_a_runner_checkout(self):
        with patch.object(probe.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '', '')) as run:
            probe.probe_source()
            self.assertEqual(run.call_args.kwargs.get('cwd'), '/', 'repository config must not rewrite fixed source URL')

    def test_http_transport_failures_are_closed_codes_not_stderr(self):
        for code, expected in ((5, 'proxy_dns_error'), (6, 'dns_error'), (7, 'connect_error'), (28, 'timeout'), (35, 'tls_handshake_error'), (60, 'tls_certificate_error')):
            with patch.object(probe, 'command', return_value=(code, 'secret-token')):
                result = probe.probe_http(probe.TARGETS[0])
                self.assertEqual(result['result'], expected)
                self.assertIsNone(result['http_status'])
                self.assertNotIn('secret', json.dumps(result))
        with patch.object(probe, 'command', return_value=(0, '401')):
            self.assertEqual(probe.probe_http(probe.TARGETS[1])['result'], 'reachable')

    def test_timeout_and_os_error_do_not_leak_exception_details(self):
        for error, expected in ((subprocess.TimeoutExpired('secret', 15), 28), (OSError('secret'), 127)):
            with patch.object(probe.subprocess, 'run', side_effect=error):
                self.assertEqual(probe.command(['git']), (expected, ''))

    def test_source_is_validated_without_printing_remote_output(self):
        sha = 'a' * 40
        with patch.object(probe, 'command', return_value=(0, sha + '\trefs/heads/main\n')):
            self.assertEqual(probe.probe_source()['sha'], sha)
        for output in ('secret-token', sha+' refs/heads/main extra', sha+' refs/heads/feature'):
            with patch.object(probe, 'command', return_value=(0, output)):
                self.assertIsNone(probe.probe_source()['sha'])

    def test_credential_and_git_override_environment_is_not_forwarded(self):
        with patch.dict(probe.os.environ, {'GITHUB_TOKEN': 'secret', 'GIT_CONFIG_COUNT': '1', 'COSIGN_REPOSITORY': 'evil', 'HTTPS_PROXY': 'https://proxy.example.test'}, clear=True):
            env = probe.public_environment()
            self.assertNotIn('GITHUB_TOKEN', env)
            self.assertNotIn('GIT_CONFIG_COUNT', env)
            self.assertNotIn('COSIGN_REPOSITORY', env)
            self.assertEqual(env['HTTPS_PROXY'], 'https://proxy.example.test')

    def test_status_does_not_project_unvalidated_error_or_nested_payload(self):
        for value in ({'phase': 'running', 'reason': 'Bearer secret', 'candidate': 'bad'}, {'phase': {'secret': 'token'}, 'reason': 'STARTING'}, {'phase': 'waiting', 'reason': 'SOURCE_UNAVAILABLE', 'candidate': 'secret', 'updated_at': True}):
            with patch.object(probe, 'trusted_file', return_value=True), patch.object(probe, 'command', return_value=(0, json.dumps(value))):
                self.assertEqual(probe.probe_status(), {'probe': 'public_deploy_status', 'result': 'unavailable'})

    def test_valid_public_status_is_projected_without_extra_fields(self):
        value = {'phase': 'waiting', 'reason': 'SOURCE_UNAVAILABLE', 'candidate': None, 'completed': None, 'updated_at': 1794090000, 'private': 'secret'}
        with patch.object(probe, 'trusted_file', return_value=True), patch.object(probe, 'command', return_value=(0, json.dumps(value))):
            result = probe.probe_status()
            self.assertEqual(result['reason'], 'SOURCE_UNAVAILABLE')
            self.assertNotIn('secret', json.dumps(result))

    def test_workflow_embeds_exact_reviewed_probe_without_checkout_or_secrets(self):
        source = Path(__file__).parents[2] / '.github/workflows/diagnose-home-pc-network.yml'
        workflow = source.read_text()
        lines = workflow.splitlines()
        start = lines.index("          python3 - <<'PY'") + 1
        end = lines.index('          PY', start)
        embedded = '\n'.join(line[10:] for line in lines[start:end]) + '\n'
        self.assertEqual(embedded, Path(probe.__file__).read_text())
        self.assertIn('permissions: {}', workflow)
        self.assertNotIn('uses:', workflow)
        self.assertNotIn('pull_request:', workflow)
        self.assertNotIn('secrets.', workflow)
        self.assertIn("github.ref == 'refs/heads/main'", workflow)
        self.assertIn('github.event.workflow_run.head_repository.full_name == github.repository', workflow)
        self.assertIn("vars.USD_HOME_PC_HOST_APPROVED == 'true'", workflow)

    def test_public_reason_codes_match_existing_root_protocol(self):
        status_spec = importlib.util.spec_from_file_location('root_status', Path(__file__).with_name('deploy-status.py'))
        status = importlib.util.module_from_spec(status_spec)
        status_spec.loader.exec_module(status)
        self.assertEqual(probe.REASONS, {key: value[0] for key, value in status.REASONS.items()})


if __name__ == '__main__':
    unittest.main()
