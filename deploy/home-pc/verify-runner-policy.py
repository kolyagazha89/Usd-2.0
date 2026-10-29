#!/usr/bin/env python3
"""Read-only admission for a new or existing least-privilege USD runner."""
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

TRIGGER = Path('/etc/sudoers.d/usd-home-pc-trigger')
COMMAND = '/usr/bin/systemctl start usd-auto-deploy.service'


def accepts_sudo_policy(output: str, runner: str, existing: bool) -> bool:
    if not existing:
        return re.fullmatch(r'User ' + re.escape(runner) + r' is not allowed to run sudo on [^\n]+\.\s*', output) is not None
    header = re.search(r'^User ' + re.escape(runner) + r' may run the following commands on [^\n]+:\s*$', output, re.MULTILINE)
    if not header:
        return False
    commands = ' '.join(output[header.end():].split())
    return commands == '(root) NOPASSWD: ' + COMMAND


def existing_trigger(runner: str) -> bool:
    if not TRIGGER.exists() and not TRIGGER.is_symlink():
        return False
    for path in (TRIGGER.parent, TRIGGER):
        info = path.lstat()
        if info.st_uid != 0 or info.st_mode & 0o022 or stat.S_ISLNK(info.st_mode):
            raise ValueError('Untrusted existing runner sudoers policy')
    if not TRIGGER.is_file() or TRIGGER.read_text().strip() != f'{runner} ALL=(root) NOPASSWD: {COMMAND}':
        raise ValueError('Existing runner sudoers policy differs from the narrow trigger')
    return True


def run(args: list[str]):
    return subprocess.run(args, capture_output=True, text=True, timeout=10, env={**os.environ, 'LC_ALL': 'C'})


def verify(runner: str) -> None:
    if not re.fullmatch(r'[a-z_][a-z0-9_-]*', runner) or runner == 'root':
        raise ValueError('Runner account must exist and must not be root')
    uid = run(['id', '-u', runner])
    groups = run(['id', '-nG', runner])
    if uid.returncode or not uid.stdout.strip().isdigit() or int(uid.stdout.strip()) == 0 or groups.returncode:
        raise ValueError('Runner account must exist and must not be root')
    if set(groups.stdout.split()) & {'root', 'sudo', 'wheel', 'docker'}:
        raise ValueError('Unsafe runner group')
    socket = run(['runuser', '-u', runner, '--', 'test', '-w', '/var/run/docker.sock'])
    if socket.returncode != 1:
        raise ValueError('Runner Docker socket access is allowed or unverifiable')
    existing = existing_trigger(runner)
    listing = run(['sudo', '-n', '-l', '-U', runner])
    if listing.returncode not in (0, 1) or not accepts_sudo_policy(listing.stdout + listing.stderr, runner, existing):
        raise ValueError('Runner has pre-existing sudo privileges or an unverifiable sudo policy')


if __name__ == '__main__':
    try:
        if os.geteuid() != 0 or len(sys.argv) != 2:
            raise ValueError('Run as root: verify-runner-policy.py <runner-user>')
        verify(sys.argv[1])
        print('Runner policy verified: no broad groups, Docker socket access or extra sudo grants')
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # Never print sudo output, inherited environment or command payloads.
        print(str(error) if isinstance(error, ValueError) else 'Runner policy could not be verified', file=sys.stderr)
        sys.exit(1)
