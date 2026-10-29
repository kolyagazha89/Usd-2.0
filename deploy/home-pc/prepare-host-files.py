#!/usr/bin/env python3
"""Reconcile only the known e8b5b0f scaffolding; never restart DB or ingress."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

SOURCE = Path('/opt/usd-release-source')
DEPLOY = Path('/home/usd/usd-deploy/deploy/home-pc')
STATE = Path('/var/lib/usd-deployer')
BASELINE = 'e8b5b0f22780a61e79765b8fd92167e241df82a2'
KNOWN_COMPOSE = {'compose.yaml', 'compose.local.yaml'}


def needs_upgrade(current: bytes, candidate: bytes, baseline: bytes) -> bool:
    if current == candidate:
        return False
    if current == baseline:
        return True
    raise ValueError('Customized Compose file differs from the reviewed baseline; refusing overwrite')


def validate_running_config_files(raw: str) -> None:
    paths = [Path(value).name for value in raw.split(',') if value.strip()]
    if 'compose.yaml' not in paths:
        raise ValueError('Running API has no known base Compose file')
    if any(path not in KNOWN_COMPOSE for path in paths):
        raise ValueError('Unsupported active ingress overlay; configure direct HTTPS first')


def replace(path: Path, content: bytes, *, private: bool = False) -> None:
    info = path.stat() if path.exists() else None
    fd, name = tempfile.mkstemp(prefix='.usd-setup-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(content)
        os.chmod(name, 0o600 if private else (info.st_mode & 0o777 if info else 0o644))
        if info and not private:
            os.chown(name, info.st_uid, info.st_gid)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def main() -> None:
    if os.geteuid() != 0:
        raise ValueError('Host file preparation requires root')
    for path in (SOURCE, DEPLOY, STATE):
        if path.is_symlink() or not path.is_dir():
            raise ValueError('Missing or symlinked host preparation directory')
    plans = []
    for name in ('compose.yaml', 'compose.local.yaml'):
        current, candidate = DEPLOY / name, SOURCE / 'deploy/home-pc' / name
        if current.is_symlink() or not current.is_file():
            raise ValueError('Missing or symlinked active Compose file')
        old, new = current.read_bytes(), candidate.read_bytes()
        if old == new:
            continue
        try:
            baseline = subprocess.check_output(['git', '-C', str(SOURCE), 'show', f'{BASELINE}:deploy/home-pc/{name}'], stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            subprocess.run(['git', '-C', str(SOURCE), 'fetch', '--no-tags', '--depth=1', 'origin', BASELINE], check=True)
            baseline = subprocess.check_output(['git', '-C', str(SOURCE), 'show', f'{BASELINE}:deploy/home-pc/{name}'])
        if needs_upgrade(old, new, baseline):
            plans.append((current, new, False))
    env = DEPLOY / '.env'
    if env.is_symlink() or not env.is_file():
        raise ValueError('Missing or symlinked application environment')
    if re.search(r'(?m)^[ \t]*[A-Za-z_]*TUNNEL_TOKEN[ \t]*=', env.read_text()):
        raise ValueError('Unsupported ingress token in application environment')
    running = subprocess.check_output([
        'docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=usd-home',
        '--filter', 'label=com.docker.compose.service=api'
    ], text=True).split()
    if len(running) != 1:
        raise ValueError('Expected one running USD API before host file reconciliation')
    configs = subprocess.check_output([
        'docker', 'inspect', '-f',
        '{{ index .Config.Labels "com.docker.compose.project.config_files" }}', running[0]
    ], text=True).strip()
    validate_running_config_files(configs)
    # Validate EVERY input before rewriting any host file. Backups stay private.
    if plans:
        backup = Path(tempfile.mkdtemp(prefix='setup-config-', dir=STATE))
        for path, _content, _private in plans:
            if path.exists():
                shutil.copyfile(path, backup / path.name)
                os.chmod(backup / path.name, 0o600)
        for path, content, is_private in plans:
            replace(path, content, private=is_private)
    os.chmod(env, 0o600)
    print('Reviewed local Compose files prepared; live database and ingress unchanged')


if __name__ == '__main__':
    try:
        os.umask(0o077)
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        print(str(exc) if isinstance(exc, ValueError) else 'Host file preparation failed; private configuration backups were retained', file=sys.stderr)
        sys.exit(1)
