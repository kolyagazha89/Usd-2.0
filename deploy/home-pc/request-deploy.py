#!/usr/bin/env python3
"""Unprivileged requester: exact attempt outcomes, never a moving main target."""
import argparse
from importlib.machinery import SourceFileLoader
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import time


def load_status():
    installed = Path(__file__).name == 'usd-request-deploy'
    path = Path(__file__).with_name('usd-deploy-status' if installed else 'deploy-status.py')
    if installed:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise ValueError('Untrusted status helper')
    loader = SourceFileLoader('usd_deploy_status', str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


status = load_status()


def start_service(timeout):
    try:
        result = subprocess.run(['sudo', '-n', '/usr/bin/systemctl', 'start', 'usd-auto-deploy.service'],
                                capture_output=True, timeout=timeout, check=False)
        # Public systemd metadata binds a report to the actual service invocation,
        # including coalesced starts and lock-busy no-ops with an old status file.
        identity = subprocess.run(['/usr/bin/systemctl', 'show', 'usd-auto-deploy.service',
                                   '--property=InvocationID', '--value'],
                                  capture_output=True, text=True, timeout=10, check=False)
        invocation = identity.stdout.strip() if identity.returncode == 0 else ''
        return result.returncode, invocation if status.ATTEMPT.fullmatch(invocation) else None
    except subprocess.TimeoutExpired:
        return 75, None  # Client timeout does not cancel the root service.
    except OSError:
        return 1, None


def latest_main(timeout):
    try:
        result = subprocess.run(['git', 'ls-remote', '--exit-code',
                                 'https://github.com/kolyagazha89/Usd-2.0.git', 'refs/heads/main'],
                                capture_output=True, text=True, timeout=min(20, timeout), check=False)
        values = result.stdout.split()
        return values[0] if (result.returncode == 0 and len(values) == 2
                             and values[1] == 'refs/heads/main' and status.SHA.fullmatch(values[0])) else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def verify_public(sha, timeout):
    if not isinstance(sha, str) or not status.SHA.fullmatch(sha):
        return False
    helper = Path('/usr/local/libexec/usd-verify-prerelease')
    try:
        info = helper.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022
                or not os.access(helper, os.X_OK)):
            return False
        return subprocess.run([str(helper), sha], capture_output=True, check=False,
                              timeout=timeout).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def request(trigger, *, read=None, start=start_service, verify=verify_public,
            sleep=time.sleep, clock=time.monotonic, emit=print, budget=7200, interval=30, latest=latest_main):
    if not isinstance(trigger, str) or not status.SHA.fullmatch(trigger):
        emit('INVALID_TRIGGER_SHA')
        return 1
    read = status.read_status if read is None else read
    def snapshot():
        try:
            return status.validate(read())
        except (OSError, ValueError, TypeError, UnicodeError):
            return None
    deadline = clock() + budget
    unchanged = 0
    while clock() < deadline:
        before = snapshot()
        outcome, invocation = start(max(1, deadline - clock()))
        after = snapshot()
        if after is None:
            emit('STATUS_PROTOCOL_UNAVAILABLE: install the reviewed v1 host helpers')
            return 1
        fresh = before is None or before['attempt'] != after['attempt'] or (
            before['phase'] == 'running' and after['phase'] != 'running')
        fresh = fresh and invocation == after['attempt']
        if not fresh:
            unchanged += 1
            if outcome not in (0, 75) or unchanged >= 3:
                emit('NO_CURRENT_ATTEMPT: inspect host service and installed helper version')
                return 1
        else:
            unchanged = 0
            emit('USD_DEPLOY ' + after['phase'] + ' ' + after['reason'] + ' ' + (after['candidate'] or 'unresolved'))
            if after['phase'] == 'succeeded':
                sha = after['completed']
                if outcome != 0:
                    emit('INCOMPLETE_SERVICE_RESULT: root service did not finish successfully')
                    return 1
                if sha != trigger and (clock() >= deadline or latest(max(1, deadline-clock())) != sha):
                    emit('WAITING_FOR_TRIGGER: older completion does not satisfy this request')
                    remaining = deadline-clock()
                    if remaining > 0:
                        sleep(min(interval, remaining))
                    continue
                if clock() >= deadline or not verify(sha, max(1, deadline-clock())):
                    emit('PUBLIC_ACCEPTANCE_FAILED: exact completed SHA was not accepted')
                    return 1
                emit('ACCEPTED ' + sha + (' (current main supersedes trigger)' if sha != trigger else ''))
                return 0
            if after['phase'] in ('blocked', 'failed'):
                return 1
            if after['phase'] == 'running' and outcome not in (0, 75):
                emit('INCOMPLETE_ATTEMPT: root service ended without a terminal report')
                return 1
        remaining = deadline-clock()
        if remaining > 0:
            sleep(min(interval, remaining))
    emit('DEPLOY_WAIT_TIMEOUT: current deployment was not declared accepted')
    return 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--trigger', required=True)
    args = parser.parse_args()
    raise SystemExit(request(args.trigger))
