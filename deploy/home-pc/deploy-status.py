#!/usr/bin/env python3
"""Bounded, public metadata for the root-owned USD deployment attempt.

No logs, paths, environment or arbitrary messages may enter this protocol.
Private approvals and receipts remain in /var/lib/usd-deployer (0700).
"""
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import time
import uuid

ROOT_UID = 0
DIRECTORY = Path('/run/usd-deployer')
PRIVATE = Path('/var/lib/usd-deployer')
MAX_BYTES = 8192
MAX_AGE = 3 * 60 * 60
SHA = re.compile(r'^[a-f0-9]{40}$')
ATTEMPT = re.compile(r'^[a-f0-9]{32}$')
# Phase and retryability are a closed contract, never parsed from stderr.
REASONS = {
    **dict.fromkeys(('STARTING', 'FETCHING_SOURCE', 'ACQUIRING_IMAGES', 'CHECKING_POLICY',
                     'CHECKING_CI', 'BACKING_UP', 'CHECKING_MIGRATIONS',
                     'RESTORING_BACKUP', 'APPLYING_MIGRATIONS', 'RELEASING'), ('running', False)),
    **dict.fromkeys(('SOURCE_UNAVAILABLE', 'IMAGES_PENDING', 'SIGNATURES_PENDING',
                     'CI_PENDING', 'MAIN_ADVANCED', 'INSUFFICIENT_RESOURCES',
                     'BACKUP_STORAGE_UNAVAILABLE', 'BACKUP_NOT_READY',
                     'RESTORE_REHEARSAL_FAILED', 'RELEASE_BUSY', 'PRE_SWITCH_RETRY'), ('waiting', True)),
    **dict.fromkeys(('DEPLOY_DISABLED', 'SCHEMA_POLICY_MISSING', 'SCHEMA_BASELINE_MISMATCH',
                     'BACKUP_POLICY_MISSING', 'HELPER_UPGRADE_REQUIRED', 'CI_FAILED',
                     'MIGRATION_CHECK_FAILED', 'QUARANTINED',
                     'CURRENT_RELEASE_INCONSISTENT', 'RELEASE_PRECHECK_FAILED'), ('blocked', False)),
    **dict.fromkeys(('UNEXPECTED_FAILURE', 'MIGRATION_APPLY_FAILED', 'RELEASE_FAILED'), ('failed', False)),
    **dict.fromkeys(('RELEASED', 'ALREADY_CURRENT'), ('succeeded', False)),
}
FIELDS = {'protocol', 'attempt', 'candidate', 'completed', 'phase', 'reason',
          'retryable', 'started_at', 'updated_at'}


def validate(data, *, now=None):
    now = int(time.time()) if now is None else now
    if not isinstance(data, dict) or data.keys() != FIELDS:
        raise ValueError('Invalid status fields')
    if type(data['protocol']) is not int or data['protocol'] != 1:
        raise ValueError('Unsupported status protocol')
    if not isinstance(data['attempt'], str) or not ATTEMPT.fullmatch(data['attempt']):
        raise ValueError('Invalid attempt')
    reason = data['reason']
    if not isinstance(reason, str) or reason not in REASONS:
        raise ValueError('Unknown status reason')
    if (data['phase'], data['retryable']) != REASONS[reason] or type(data['retryable']) is not bool:
        raise ValueError('Invalid phase or retry policy')
    for field in ('candidate', 'completed'):
        if data[field] is not None and (not isinstance(data[field], str) or not SHA.fullmatch(data[field])):
            raise ValueError('Invalid revision')
    if data['phase'] == 'succeeded':
        if data['candidate'] is None or data['completed'] != data['candidate']:
            raise ValueError('Completion is not bound to candidate')
    elif data['completed'] is not None:
        raise ValueError('Incomplete attempt claims completion')
    start, updated = data['started_at'], data['updated_at']
    if (type(start) is not int or type(updated) is not int or start < 0
            or not start <= updated <= now + 30 or now - updated > MAX_AGE):
        raise ValueError('Stale or invalid status time')
    return data


def trusted(path, *, directory=False):
    info = path.lstat()
    correct_type = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if (not correct_type or info.st_uid != ROOT_UID or info.st_mode & 0o022
            or (directory and info.st_mode & 0o555 != 0o555)):
        raise ValueError('Untrusted status filesystem metadata')


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate status field')
        result[key] = value
    return result


def read_status(directory=DIRECTORY, *, now=None):
    trusted(directory, directory=True)
    file = directory/'status.json'
    trusted(file)
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != ROOT_UID or info.st_mode & 0o022:
            raise ValueError('Untrusted status file')
        raw = stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('Status too large')
    return validate(json.loads(raw, object_pairs_hook=unique_pairs), now=now)


def write_status(directory, data, *, now=None):
    if os.geteuid() != ROOT_UID:
        raise ValueError('Only root may publish deployment status')
    validate(data, now=now)
    try:
        directory.mkdir(mode=0o755)
        directory.chmod(0o755)
    except FileExistsError:
        pass
    trusted(directory, directory=True)
    fd, temporary = tempfile.mkstemp(prefix='.status-', dir=directory)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(json.dumps(data, sort_keys=True) + '\n')
            stream.flush()
            os.fchmod(stream.fileno(), 0o644)
            os.fsync(stream.fileno())
        os.replace(temporary, directory/'status.json')
    finally:
        Path(temporary).unlink(missing_ok=True)


def create_attempt(directory=DIRECTORY, *, now=None, invocation=None):
    now = int(time.time()) if now is None else now
    attempt = invocation if invocation is not None else uuid.uuid4().hex
    write_status(directory, {'protocol': 1, 'attempt': attempt, 'candidate': None,
                            'completed': None, 'phase': 'running', 'reason': 'STARTING',
                            'retryable': False, 'started_at': now, 'updated_at': now}, now=now)
    return attempt


def update_attempt(attempt, reason, *, candidate=None, directory=DIRECTORY, now=None):
    now = int(time.time()) if now is None else now
    previous = read_status(directory, now=now)
    if previous['attempt'] != attempt or previous['phase'] != 'running':
        raise ValueError('Attempt superseded or already finished')
    if reason not in REASONS:
        raise ValueError('Unknown status reason')
    phase, retryable = REASONS[reason]
    candidate = previous['candidate'] if candidate is None else candidate
    data = {**previous, 'candidate': candidate, 'completed': candidate if phase == 'succeeded' else None,
            'reason': reason, 'phase': phase, 'retryable': retryable, 'updated_at': now}
    write_status(directory, data, now=now)


def guard_candidate(candidate, directory=PRIVATE):
    """Persist intent BEFORE any live mutation, even if parent is killed."""
    if os.geteuid() != ROOT_UID or not isinstance(candidate, str) or not SHA.fullmatch(candidate):
        raise ValueError('Invalid privileged mutation guard')
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != ROOT_UID or info.st_mode & 0o077:
        raise ValueError('Untrusted private deployment state')
    fd, temporary = tempfile.mkstemp(prefix='.mutation-', dir=directory)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(candidate+'\n')
            stream.flush()
            os.fchmod(stream.fileno(), 0o600)
            os.fsync(stream.fileno())
        os.replace(temporary, directory/'failed-release-sha')
        descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        Path(temporary).unlink(missing_ok=True)


def main(args):
    if args == ['read']:
        print(json.dumps(read_status(), sort_keys=True))
    elif args == ['start']:
        print(create_attempt(invocation=os.environ.get('INVOCATION_ID')))
    elif len(args) == 2 and args[0] == 'guard':
        guard_candidate(args[1])
    elif len(args) in (3, 4) and args[0] == 'update':
        update_attempt(args[1], args[2], candidate=args[3] if len(args) == 4 else None)
    else:
        raise ValueError('Unsupported status operation')


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except (OSError, ValueError, TypeError, UnicodeError):
        print('USD deployment status unavailable; inspect the reviewed host helpers', file=sys.stderr)
        sys.exit(1)
