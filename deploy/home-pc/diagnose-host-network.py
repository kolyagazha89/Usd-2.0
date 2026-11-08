#!/usr/bin/env python3
"""Bounded public-network evidence; no deployment or private host reads."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

TARGETS = (
    ('github_https', 'https://github.com/kolyagazha89/Usd-2.0', (200,)),
    ('ghcr_https', 'https://ghcr.io/v2/', (200, 401)),
    ('sigstore_trust_https', 'https://tuf-repo-cdn.sigstore.dev/timestamp.json', (200,)),
)
EXPECTED_COSIGN = '4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71'
SHA = re.compile(r'[a-f0-9]{40}')
REASONS = {
    **dict.fromkeys(('STARTING', 'FETCHING_SOURCE', 'ACQUIRING_IMAGES', 'CHECKING_POLICY', 'CHECKING_CI',
                     'BACKING_UP', 'CHECKING_MIGRATIONS', 'RESTORING_BACKUP', 'APPLYING_MIGRATIONS', 'RELEASING'), 'running'),
    **dict.fromkeys(('SOURCE_UNAVAILABLE', 'IMAGES_PENDING', 'SIGNATURES_PENDING', 'CI_PENDING', 'MAIN_ADVANCED',
                     'INSUFFICIENT_RESOURCES', 'BACKUP_STORAGE_UNAVAILABLE', 'BACKUP_NOT_READY', 'RESTORE_REHEARSAL_FAILED',
                     'RELEASE_BUSY', 'PRE_SWITCH_RETRY'), 'waiting'),
    **dict.fromkeys(('DEPLOY_DISABLED', 'SCHEMA_POLICY_MISSING', 'SCHEMA_BASELINE_MISMATCH', 'BACKUP_POLICY_MISSING',
                     'HELPER_UPGRADE_REQUIRED', 'CI_FAILED', 'MIGRATION_CHECK_FAILED', 'QUARANTINED',
                     'CURRENT_RELEASE_INCONSISTENT', 'RELEASE_PRECHECK_FAILED'), 'blocked'),
    **dict.fromkeys(('UNEXPECTED_FAILURE', 'MIGRATION_APPLY_FAILED', 'RELEASE_FAILED'), 'failed'),
    **dict.fromkeys(('RELEASED', 'ALREADY_CURRENT'), 'succeeded'),
}


def public_environment():
    env = {key: value for key, value in os.environ.items()
           if key.lower() in ('http_proxy', 'https_proxy', 'no_proxy')}
    env.update(PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
               GIT_TERMINAL_PROMPT='0', GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null')
    return env


def command(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=15,
                                env=public_environment(), cwd='/', check=False)
        return result.returncode, result.stdout
    except subprocess.TimeoutExpired:
        return 28, ''
    except OSError:
        return 127, ''


def probe_http(target):
    name, url, accepted = target
    code, output = command(['curl', '-q', '--silent', '--output', '/dev/null', '--write-out', '%{http_code}',
                            '--connect-timeout', '5', '--max-time', '12', '--max-filesize', '1048576',
                            '--proto', '=https', '--max-redirs', '0', url])
    status = int(output) if re.fullmatch(r'[1-5][0-9]{2}', output) else None
    category = {5: 'proxy_dns_error', 6: 'dns_error', 7: 'connect_error', 28: 'timeout',
                35: 'tls_handshake_error', 60: 'tls_certificate_error', 127: 'tool_unavailable'}.get(code, 'transport_error')
    return {'probe': name, 'result': ('reachable' if status in accepted else 'unexpected_http_status')
            if code == 0 else category, 'http_status': status}


def probe_source():
    code, output = command(['git', '-c', 'credential.helper=', '-c', 'core.askPass=/bin/false',
                            'ls-remote', '--exit-code', 'https://github.com/kolyagazha89/Usd-2.0.git',
                            'refs/heads/main'])
    parts = output.split()
    sha = parts[0] if code == 0 and len(parts) == 2 and SHA.fullmatch(parts[0]) and parts[1] == 'refs/heads/main' else None
    return {'probe': 'git_main', 'result': 'reachable' if sha else 'source_unavailable', 'sha': sha}


def trusted_file(path):
    try:
        parent, info = path.parent.lstat(), path.lstat()
        return (stat.S_ISDIR(parent.st_mode) and parent.st_uid == 0 and not parent.st_mode & 0o022
                and stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022)
    except OSError:
        return False


def probe_tools():
    binary = Path('/usr/local/libexec/usd-cosign')
    checksum = None
    if trusted_file(binary):
        try:
            with binary.open('rb') as stream:
                checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
        except OSError:
            pass
    return {'probe': 'pinned_cosign', 'result': 'checksum_matches' if checksum == EXPECTED_COSIGN else 'missing_unreadable_or_mismatched'}


def probe_status():
    helper = Path('/usr/local/libexec/usd-deploy-status')
    if trusted_file(helper):
        code, output = command([str(helper), 'read'])
        try:
            value = json.loads(output) if code == 0 else None
            if (isinstance(value, dict) and isinstance(value.get('reason'), str)
                    and value['reason'] in REASONS and value.get('phase') == REASONS[value['reason']]
                    and type(value.get('updated_at')) is int and value['updated_at'] >= 0
                    and all(value.get(key) is None or isinstance(value.get(key), str) and SHA.fullmatch(value[key])
                            for key in ('candidate', 'completed'))
                    and (value['phase'] == 'succeeded' and value.get('candidate') is not None
                         and value.get('completed') == value['candidate']
                         or value['phase'] != 'succeeded' and value.get('completed') is None)):
                # Explicit projection: never print extra fields, raw errors or environment.
                return {'probe': 'public_deploy_status', **{key: value.get(key) for key in
                        ('phase', 'reason', 'candidate', 'completed', 'updated_at')}}
        except (ValueError, TypeError):
            pass
    return {'probe': 'public_deploy_status', 'result': 'unavailable'}


def diagnose():
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(probe_http, target) for target in TARGETS]
        futures.append(pool.submit(probe_source))
        network = [future.result() for future in futures]
    return {'scope': 'unprivileged_runner_public_network_only', 'network': network,
            'tools': probe_tools(), 'attempt': probe_status(),
            'acceptance': 'diagnostic_only_not_signature_or_deployment_acceptance'}


if __name__ == '__main__':
    print(json.dumps(diagnose(), sort_keys=True))
