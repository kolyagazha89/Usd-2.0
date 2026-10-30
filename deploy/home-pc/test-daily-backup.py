#!/usr/bin/env python3
"""Synthetic, offline safety tests; no host paths or real services are touched.

Local non-root runs patch the expected privileged UID to the fixture owner.
CI runs these same checks as root, with genuine root-owned fixture files.
Docker/rclone are process boundaries; orchestration, filesystem permissions,
locks, policy parsing and success receipts execute normally.
"""
import contextlib
import copy
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import warnings
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SHA = 'a' * 40
IMAGE = 'sha256:' + 'b' * 64
FRONT = 'sha256:' + 'c' * 64
DB_IMAGE = 'sha256:' + 'd' * 64
ARCHIVE = b'PGDMP-synthetic-private-data'


class DailyBackupTests(unittest.TestCase):
    def test_parent_sigterm_keeps_lock_until_term_ignoring_verifier_is_killed(self):
        with tempfile.TemporaryDirectory() as folder:
            lock = Path(folder) / 'lock'
            ready = Path(folder) / 'child.pid'
            child_code = ('import os,signal,time;from pathlib import Path;'
                          'signal.signal(signal.SIGTERM,signal.SIG_IGN);'
                          f'Path({str(ready)!r}).write_text(str(os.getpid()));'
                          'time.sleep(30)')
            code = f'''import importlib.util,fcntl,sys
spec=importlib.util.spec_from_file_location('backup',{str(HERE / 'daily-backup.py')!r})
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
worker.TERM_GRACE_SECONDS=0.5
worker.install_signal_handlers()
with open({str(lock)!r},'w') as handle:
    fcntl.flock(handle,fcntl.LOCK_EX)
    try: worker.command([sys.executable,'-c',{child_code!r}],timeout=30)
    except worker.BackupError as error: sys.exit(error.code)
'''
            parent = subprocess.Popen([sys.executable, '-c', code], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 5
                while not ready.exists() and parent.poll() is None and time.monotonic() < deadline:
                    time.sleep(0.01)
                self.assertTrue(ready.exists(), 'synthetic verifier must have started')
                child = int(ready.read_text())
                parent.send_signal(signal.SIGTERM)
                with lock.open('a') as handle:
                    with self.assertRaises(BlockingIOError): fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self.assertIsNone(parent.poll(), 'parent must retain lock during cleanup grace')
                    self.assertEqual(parent.wait(timeout=5), 143)
                    with self.assertRaises(ProcessLookupError): os.kill(child, 0)
                    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                if parent.poll() is None: parent.kill()
                parent.communicate(timeout=5)

    def setUp(self):
        script = HERE / 'daily-backup.py'
        self.assertTrue(script.is_file(), 'Daily backup-only worker is missing')
        spec = importlib.util.spec_from_file_location('usd_daily_backup', script)
        self.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.worker)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ('state', 'policy', 'deploy', 'helpers'):
            (self.root / name).mkdir(mode=0o700)
        self.worker.ROOT_UID = os.geteuid()
        self.worker.STATE = self.root / 'state'
        self.worker.POLICY = self.root / 'policy'
        self.worker.DEPLOY_ENV = self.root / 'deploy/.env'
        self.worker.ENABLED = self.root / 'enabled'
        self.worker.LOCK = self.root / 'deploy.lock'
        self.worker.HELPERS = {
            'database': self.root / 'helpers/database',
            'media': self.root / 'helpers/media',
            'restore': self.root / 'helpers/restore',
        }
        self.write(self.worker.DEPLOY_ENV, '\n'.join([
            'APP_DOMAIN=app.usd-russia.ru', 'API_DOMAIN=api.usd-russia.ru',
            'USD_IMAGE_TAG=' + SHA, 'POSTGRES_USER=usd', 'POSTGRES_DB=usd',
            'POSTGRES_PASSWORD=synthetic-password',
            'DATABASE_URL=postgresql://usd:synthetic-password@db:5432/usd?schema=public',
        ]) + '\n')
        self.write(self.worker.POLICY / 'db-backup.conf', 'offsite:backups/postgres\n')
        self.write(self.worker.POLICY / 'media-backup.conf', 'source:usd-media\noffsite:backups/media\n')
        self.review = {
            'version': 1, 'independent_of_hyperv_host': True, 'retention': 'keep-all',
            'api_media_endpoint': 'http://usd-s3:9000', 'media_source_endpoint': 'http://127.0.0.1:19000',
            'api_media_bucket': 'usd-media', 'source_maps_to_api': True,
        }
        self.save_review()
        self.config = ('[source]\ntype = s3\nprovider = Other\nenv_auth = false\n'
                       'endpoint = http://127.0.0.1:19000\naccess_key_id = source-id\nsecret_access_key = source-secret\n'
                       '[offsite]\ntype = s3\nprovider = Other\nenv_auth = false\n'
                       'endpoint = https://s3.us-east-005.backblazeb2.com\naccess_key_id = destination-id\nsecret_access_key = destination-secret\n')
        self.write(self.worker.STATE / 'rclone.conf', self.config)
        for helper in self.worker.HELPERS.values():
            self.write(helper, '#!/bin/sh\nexit 0\n', 0o750)
        self.calls = []
        self.remote = {}
        self.inventory = [{'Path': 'photos/test.bin', 'Size': 8, 'ModTime': '2026-10-30T00:00:00Z', 'Hashes': {'MD5': 'fixture'}}]
        self.inventory_calls = 0
        self.fail_phase = None
        self.drift = None
        self.db_inspects = 0
        self.original_command = self.worker.command
        self.command_patch = patch.object(self.worker, 'command', self.fake_command)
        self.command_patch.start()
        self.addCleanup(self.command_patch.stop)
        resolver = patch.object(self.worker.socket, 'getaddrinfo', return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('8.8.8.8', 443))])
        resolver.start()
        self.addCleanup(resolver.stop)

    def write(self, path, text, mode=0o600):
        path.write_text(text)
        path.chmod(mode)

    def save_review(self):
        self.write(self.worker.POLICY / 'daily-backup.json', json.dumps(self.review))

    def enable(self):
        self.write(self.worker.ENABLED, 'verified-off-host-backup-v1\n')

    def container(self, service):
        identity = {'api': IMAGE, 'frontend': FRONT, 'db': DB_IMAGE}[service]
        image = {'api': f'ghcr.io/kolyagazha89/usd-2.0-api:{SHA}',
                 'frontend': f'ghcr.io/kolyagazha89/usd-2.0-frontend:{SHA}', 'db': 'postgres:18-alpine'}[service]
        env = {'NODE_ENV': 'production', 'DATABASE_URL': 'postgresql://usd:synthetic-password@db:5432/usd?schema=public',
               'S3_ENDPOINT': 'http://usd-s3:9000', 'S3_BUCKET': 'usd-media',
               'S3_ACCESS_KEY_ID': 'source-id', 'S3_SECRET_ACCESS_KEY': 'source-secret'} if service == 'api' else {
                   'POSTGRES_USER': 'usd', 'POSTGRES_DB': 'usd', 'POSTGRES_PASSWORD': 'synthetic-password'}
        result = {'Id': service + '-container', 'Image': identity,
                  'Config': {'Image': image, 'Env': [key + '=' + value for key, value in env.items()],
                             'Labels': {'com.docker.compose.project': 'usd-home', 'com.docker.compose.service': service}},
                  'State': {'Running': True, 'StartedAt': '2026-10-30T00:00:00Z', 'Health': {'Status': 'healthy'}},
                  'NetworkSettings': {'Networks': {'usd-internal': {'IPAddress': '172.22.0.2' if service == 'db' else '172.22.0.3'}}}}
        if self.drift == 'external-db' and service == 'api':
            result['Config']['Env'][1] = 'DATABASE_URL=postgresql://usd:synthetic-password@remote.invalid:5432/usd'
        if self.drift == 'wrong-image' and service == 'api':
            result['Config']['Image'] = 'untrusted:latest'
        if self.drift == 'media-credentials' and service == 'api':
            result['Config']['Env'].append('S3_SECRET_ACCESS_KEY=other-source-secret')
        if self.drift == 'restart' and service == 'db' and self.db_inspects > 1:
            result['State']['StartedAt'] = '2026-10-30T00:01:00Z'
        if self.drift == 'pg-override' and service == 'db':
            result['Config']['Env'].append('PGHOSTADDR=192.0.2.9')
        return result

    def fake_command(self, args, *, stdout=None, stdin=None, timeout=120, log=None):
        args = [str(value) for value in args]
        self.calls.append(args)
        if args[0] == 'docker':
            if args[1] == 'ps':
                service = args[-1].split('=')[-1]
                return (service + '-container\n').encode()
            if args[1] == 'inspect':
                service = args[-1].removesuffix('-container')
                if service == 'db': self.db_inspects += 1
                return json.dumps([self.container(service)]).encode()
            if args[1:3] == ['image', 'inspect']:
                identity = FRONT if 'frontend:' in args[-1] else DB_IMAGE if args[-1] == 'postgres:18-alpine' else IMAGE
                if self.drift == 'replaced-tag' and 'api:' in args[-1]: identity = FRONT
                return json.dumps([{'Id': identity, 'Config': {'Labels': {'org.opencontainers.image.revision': SHA}}}]).encode()
            if args[1] == 'exec' and 'pg_dump' in args[-1]:
                if self.fail_phase == 'dump': raise self.worker.BackupError('dump failed')
                stdout.write(ARCHIVE)
                return b''
            if args[1] == 'exec' and args[2] == 'db-container' and 'server_version_num' in args[-1]:
                return b'160000\n' if self.drift == 'pg16' else b'180006\n'
            if args[1] == 'exec' and args[2] == 'api-container' and args[3] == 'node':
                return json.dumps({'server': '172.22.0.99' if self.drift == 'api-routing' else '172.22.0.2',
                                   'name': 'usd', 'username': 'usd', 'version': 180006}).encode()
            if args[1] == 'exec' and 'pg_restore' in args:
                return b'Archive list\n'
        if args[0] == 'rclone':
            if args[1] == 'lsjson':
                self.inventory_calls += 1
                result = copy.deepcopy(self.inventory)
                if self.drift == 'media' and self.inventory_calls > 1: result[0]['Size'] = 9
                return json.dumps(result).encode()
            if args[1] == 'copyto':
                if self.fail_phase == 'receipt': raise self.worker.BackupError('remote receipt failed')
                self.remote[args[-1]] = Path(args[-2]).read_bytes()
                return b''
            if args[1] == 'cat': return self.remote[args[-1]]
        for phase, helper in self.worker.HELPERS.items():
            if args[0] == str(helper):
                if self.fail_phase == phase: raise self.worker.BackupError('verification failed')
                if phase == 'restore': self.assertEqual(args[-1], IMAGE)
                if phase == 'media' and self.drift == 'env':
                    with self.worker.DEPLOY_ENV.open('a') as target: target.write('# changed during backup\n')
                return b''
        self.fail('Unexpected command would escape the fixture: ' + repr(args))

    def receipt(self):
        return self.worker.STATE / 'daily-backup-last-success.json'

    def test_disabled_default_never_accesses_docker_or_remotes(self):
        self.assertEqual(self.worker.main(), 0)
        self.assertEqual(self.calls, [])

    def test_source_policy_check_does_not_enable_or_dump_anything(self):
        self.assertEqual(self.worker.main(check_source=True), 0)
        self.assertFalse(self.worker.ENABLED.exists())
        self.assertFalse((self.worker.STATE / 'backups').exists())
        self.assertFalse(any(args[0] == 'rclone' or 'pg_dump' in args[-1] for args in self.calls))

    def test_verified_backup_has_private_receipt_matching_both_unique_destinations(self):
        self.enable()
        self.assertEqual(self.worker.main(), 0)
        first = json.loads(self.receipt().read_text())
        self.assertEqual(first['postgres_major'], 18)
        self.assertEqual(first['image_id'], IMAGE)
        self.assertIn(first['snapshot_id'], first['database_remote'])
        self.assertIn(first['snapshot_id'], first['media_remote'])
        self.assertEqual(self.receipt().stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.worker.main(), 0)
        self.assertNotEqual(first['snapshot_id'], json.loads(self.receipt().read_text())['snapshot_id'])
        for args in self.calls:
            self.assertNotIn('delete', args)
            self.assertNotIn('purge', args)
            self.assertNotIn('sync', args)
            self.assertNotIn('restart', args)
            self.assertNotIn('compose', args)

    def test_deploy_lock_contention_is_retryable_without_docker_access(self):
        self.enable()
        with self.worker.LOCK.open('w') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(self.worker.BackupError) as result: self.worker.main()
        self.assertEqual(result.exception.code, 75)
        self.assertEqual(self.calls, [])

    def test_failed_verification_never_publishes_success(self):
        self.enable()
        for phase in ('dump', 'database', 'restore', 'media', 'receipt'):
            with self.subTest(phase=phase):
                self.fail_phase = phase
                with self.assertRaises(self.worker.BackupError): self.worker.main()
                self.assertFalse(self.receipt().exists())

    def test_source_drift_invalidates_run(self):
        self.enable()
        for drift in ('external-db', 'wrong-image', 'replaced-tag', 'pg16', 'restart', 'media', 'env'):
            with self.subTest(drift=drift):
                self.drift = drift
                self.db_inspects = self.inventory_calls = 0
                with self.assertRaises(self.worker.BackupError): self.worker.main()
                self.assertFalse(self.receipt().exists())

    def test_api_must_actually_connect_to_the_local_database_being_dumped(self):
        self.enable()
        self.drift = 'api-routing'
        with self.assertRaises(self.worker.BackupError): self.worker.main()
        self.assertFalse(any('pg_dump' in args[-1] for args in self.calls))

    def test_libpq_connection_override_in_running_database_is_rejected(self):
        self.enable()
        self.drift = 'pg-override'
        with self.assertRaises(self.worker.BackupError): self.worker.main()
        self.assertFalse(any('pg_dump' in args[-1] for args in self.calls))

    def test_database_name_cannot_be_interpreted_as_a_libpq_connection_string(self):
        env = self.worker.DEPLOY_ENV.read_text().replace('POSTGRES_DB=usd', 'POSTGRES_DB=host=remote.invalid dbname=usd')
        env = env.replace('/usd?schema=public', '/host%3Dremote.invalid%20dbname%3Dusd?schema=public')
        self.write(self.worker.DEPLOY_ENV, env)
        with self.assertRaises(self.worker.BackupError): self.worker.deployment_values()

    def test_api_media_credentials_must_match_reviewed_rclone_source(self):
        self.enable()
        self.write(self.worker.STATE / 'rclone.conf', self.config.replace('source-secret', 'other-source'))
        with self.assertRaises(self.worker.BackupError): self.worker.main()
        self.assertFalse(any('pg_dump' in args[-1] for args in self.calls))

    def test_public_hostname_resolving_to_local_host_is_not_off_host(self):
        self.enable()
        for address in ('127.0.0.1', '192.168.1.9', '100.64.0.9', '::1'):
            with self.subTest(address=address), patch.object(self.worker.socket, 'getaddrinfo', return_value=[
                    (socket.AF_INET, socket.SOCK_STREAM, 6, '', (address, 443))]):
                with self.assertRaises(self.worker.BackupError): self.worker.main()
        self.assertEqual(self.calls, [])

    def test_rclone_cannot_disable_tls_verification_or_inherit_default_options(self):
        self.enable()
        for content in (self.config + 'no_check_certificate = true\n',
                        '[DEFAULT]\nendpoint = https://s3.example.test\n' + self.config):
            with self.subTest(content=content):
                self.write(self.worker.STATE / 'rclone.conf', content)
                with self.assertRaises(self.worker.BackupError): self.worker.main()
        self.assertEqual(self.calls, [])

    def test_public_read_backup_acl_is_rejected(self):
        self.enable()
        self.write(self.worker.STATE / 'rclone.conf', self.config + 'acl = public-read\n')
        with self.assertRaises(self.worker.BackupError): self.worker.main()
        self.assertEqual(self.calls, [])

    def test_source_endpoint_casing_cannot_alias_the_destination(self):
        self.enable()
        endpoint = 'https://S3.US-EAST-005.BACKBLAZEB2.COM:443'
        self.review['media_source_endpoint'] = endpoint
        self.save_review()
        self.write(self.worker.STATE / 'rclone.conf', self.config.replace('http://127.0.0.1:19000', endpoint))
        with self.assertRaises(self.worker.BackupError): self.worker.main()
        self.assertEqual(self.calls, [])

    def test_failed_attempt_preserves_previous_success_receipt(self):
        self.enable()
        self.worker.main()
        previous = self.receipt().read_bytes()
        self.fail_phase = 'database'
        with self.assertRaises(self.worker.BackupError): self.worker.main()
        self.assertEqual(self.receipt().read_bytes(), previous)

    def test_archive_descriptors_are_closed_before_completion(self):
        self.enable()
        with warnings.catch_warnings(record=True) as notices:
            warnings.simplefilter('always', ResourceWarning)
            self.worker.main()
        self.assertFalse([notice for notice in notices if notice.category is ResourceWarning])

    def test_insecure_or_symlinked_policy_stops_before_docker(self):
        self.enable()
        policy = self.worker.POLICY / 'db-backup.conf'
        policy.chmod(0o644)
        with self.assertRaises(self.worker.BackupError): self.worker.main()
        policy.chmod(0o600)
        policy.rename(policy.with_suffix('.real'))
        policy.symlink_to(policy.with_suffix('.real'))
        with self.assertRaises(self.worker.BackupError): self.worker.main()
        self.assertEqual(self.calls, [])

    def test_same_pc_local_alias_and_loopback_destinations_are_rejected(self):
        self.enable()
        for replacement in ('type = local', 'type = alias\nremote = /srv/usd-backups',
                            'type = s3\nendpoint = http://127.0.0.1:19000'):
            with self.subTest(replacement=replacement):
                content = self.config.split('[offsite]')[0] + '[offsite]\n' + replacement + '\n'
                self.write(self.worker.STATE / 'rclone.conf', content)
                with self.assertRaises(self.worker.BackupError): self.worker.main()
                self.assertFalse(self.receipt().exists())

    def test_review_must_confirm_independence_and_forbid_retention_deletion(self):
        self.enable()
        for key, value in [('independent_of_hyperv_host', False), ('retention', 'delete-after-30-days'), ('source_maps_to_api', False)]:
            previous = self.review[key]
            self.review[key] = value
            self.save_review()
            with self.assertRaises(self.worker.BackupError): self.worker.main()
            self.review[key] = previous
        self.assertEqual(self.calls, [])

    def test_inherited_docker_and_rclone_overrides_are_not_forwarded(self):
        with patch.dict(os.environ, {'DOCKER_HOST': 'tcp://remote.invalid:2375', 'DOCKER_CONTEXT': 'remote',
                                    'RCLONE_CONFIG': '/tmp/evil', 'RCLONE_CONFIG_OFFSITE_TYPE': 'local', 'AWS_ENDPOINT_URL': 'http://remote.invalid'}):
            env = self.worker.safe_environment()
        self.assertEqual(env['DOCKER_HOST'], 'unix:///var/run/docker.sock')
        self.assertEqual(env['RCLONE_CONFIG'], str(self.worker.STATE / 'rclone.conf'))
        for key in ('DOCKER_CONTEXT', 'RCLONE_CONFIG_OFFSITE_TYPE', 'AWS_ENDPOINT_URL'): self.assertNotIn(key, env)

    def test_private_subprocess_failure_omits_credentials(self):
        with self.assertRaises(self.worker.BackupError) as result:
            self.original_command(['/bin/sh', '-c', 'echo synthetic-secret >&2; exit 7'])
        self.assertNotIn('synthetic-secret', str(result.exception))

    def test_command_timeout_stops_descendants_before_unlocking(self):
        child_file = self.root / 'child.pid'
        try:
            with self.assertRaises(self.worker.BackupError) as result:
                self.original_command(['/bin/bash', '-c',
                    'trap \'wait "$child" || true; exit 143\' TERM; sleep 60 & child=$!; '
                    'printf "%s" "$child" > "$1"; wait "$child"', 'fixture', str(child_file)], timeout=0.2)
            self.assertEqual(result.exception.code, 75)
            child = int(child_file.read_text())
            state = Path(f'/proc/{child}/stat')
            self.assertTrue(not state.exists() or state.read_text().split()[2] == 'Z',
                            'Timed-out verifier child remains running after the lock can be released')
        finally:
            if child_file.exists():
                try: os.kill(int(child_file.read_text()), signal.SIGKILL)
                except ProcessLookupError: pass


class InstallationTests(unittest.TestCase):
    def test_daily_timer_retries_failed_runs_and_preserves_private_state(self):
        service = HERE / 'usd-daily-backup.service'
        timer = HERE / 'usd-daily-backup.timer'
        self.assertTrue(service.is_file(), 'Daily backup systemd service is missing')
        self.assertTrue(timer.is_file(), 'Daily backup timer is missing')
        text = service.read_text()
        for item in ('User=root', 'UMask=0077', 'Restart=on-failure', 'RestartSec=15min',
                     'StateDirectoryMode=0700', 'NoNewPrivileges=true', 'PrivateTmp=true',
                     'ExecStart=/usr/local/sbin/usd-daily-backup'):
            self.assertIn(item, text)
        self.assertNotIn('SuccessExitStatus=75', text)
        self.assertIn('Requisite=docker.service', text)
        self.assertNotIn('Requires=docker.service', text)
        self.assertIn('OnCalendar=*-*-* 03:15:00 UTC', timer.read_text())
        self.assertIn('Persistent=true', timer.read_text())

    @unittest.skipUnless(os.geteuid() == 0, 'Root fixture runs in isolated Python container/CI')
    def test_installer_is_inert_and_serialized(self):
        installer = HERE / 'install-daily-backup.sh'
        self.assertTrue(installer.is_file(), 'Inert daily backup installer is missing')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'
            source.mkdir()
            for name in ('daily-backup.py', 'usd-daily-backup.service', 'usd-daily-backup.timer',
                         'verify-db-offsite-backup.sh', 'verify-media-backup.sh', 'rehearse-schema-on-backup.sh'):
                shutil.copyfile(HERE / name, source / name)
            text = installer.read_text()
            for path in ('/usr/local/sbin', '/usr/local/libexec', '/etc/systemd/system',
                         '/var/lib/usd-deployer', '/etc/usd-deployer', '/etc/usd-backup-enabled',
                         '/run/lock/usd-home-deploy.lock'):
                target = root / path.removeprefix('/')
                target.parent.mkdir(parents=True, exist_ok=True)
                text = text.replace(path, str(target))
            script = source / 'install.sh'
            script.write_text(text)
            fakebin = root / 'bin'
            fakebin.mkdir()
            log = root / 'systemctl.log'
            (fakebin / 'systemctl').write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$INSTALL_LOG"\ncase "$1" in is-active|is-enabled) exit 1;; esac\n')
            (fakebin / 'systemctl').chmod(0o755)
            env = {**os.environ, 'PATH': str(fakebin) + ':' + os.environ['PATH'], 'INSTALL_LOG': str(log)}
            result = subprocess.run(['bash', str(script)], capture_output=True, text=True, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(log.read_text().strip(), 'is-active --quiet usd-daily-backup.timer\nis-enabled --quiet usd-daily-backup.timer\ndaemon-reload')
            self.assertFalse((root / 'etc/usd-backup-enabled').exists())
            self.assertFalse((root / 'etc/usd-deployer/daily-backup.json').exists())
            self.assertEqual((root / 'usr/local/sbin/usd-daily-backup').stat().st_mode & 0o777, 0o750)
            self.assertEqual((root / 'var/lib/usd-deployer').stat().st_mode & 0o777, 0o700)
            lock = root / 'run/lock/usd-home-deploy.lock'
            with lock.open('w') as handle:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                refused = subprocess.run(['bash', str(script)], capture_output=True, text=True, env=env)
            self.assertEqual(refused.returncode, 75)
            self.assertIn('lock busy', refused.stderr)
            local = root / 'usr/local'
            local.rename(root / 'usr/local-real')
            local.symlink_to(root / 'usr/local-real')
            refused = subprocess.run(['bash', str(script)], capture_output=True, text=True, env=env)
            self.assertNotEqual(refused.returncode, 0, 'Installer followed a symlinked ancestor directory')
            self.assertIn('symlink', refused.stderr)


@unittest.skipUnless(os.geteuid() == 0 and shutil.which('rclone'), 'Needs root plus real local rclone fixture transport')
class ArchiveTransportTests(unittest.TestCase):
    def test_real_private_archive_round_trip_and_reused_object_refusal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'source.dump'
            archive.write_bytes(ARCHIVE)
            archive.chmod(0o600)
            config = root / 'rclone.conf'
            config.write_text('[fixture]\ntype = local\n')
            config.chmod(0o600)
            env = {'PATH': os.environ['PATH'], 'HOME': str(root), 'RCLONE_CONFIG': str(config),
                   'TMPDIR': str(root)}
            args = ['bash', str(HERE / 'verify-db-offsite-backup.sh'), str(archive), 'fixture:snapshots/one.dump']
            result = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((root / 'snapshots/one.dump').read_bytes(), ARCHIVE)
            refused = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, timeout=30)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn('refusing overwrite', refused.stderr)
            self.assertEqual((root / 'snapshots/one.dump').read_bytes(), ARCHIVE)


if __name__ == '__main__':
    unittest.main()
