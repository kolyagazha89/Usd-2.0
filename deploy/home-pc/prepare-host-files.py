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
KEYS = {'TUNNEL_TOKEN', 'CLOUDFLARE_TUNNEL_TOKEN'}


def needs_upgrade(current: bytes, candidate: bytes, baseline: bytes) -> bool:
    if current == candidate:
        return False
    if current == baseline:
        return True
    raise ValueError('Customized Compose file differs from the reviewed baseline; refusing overwrite')


def token_value(raw: str) -> str:
    value = raw.strip()
    if value.startswith(('"', "'")):
        if len(value) < 2 or value[-1] != value[0]:
            raise ValueError('Invalid tunnel credential quoting')
        value = value[1:-1]
    else:
        value = re.sub(r'\s+#.*$', '', value).strip()
    if not re.fullmatch(r'[A-Za-z0-9_./+=-]+', value):
        raise ValueError('Invalid or unresolved tunnel credential; value was not printed')
    return value


def isolate_tunnel(shared: str, private: str | None) -> tuple[str, str | None]:
    tokens = []
    keep = []
    for line in shared.splitlines(keepends=True):
        key, sep, value = line.strip().partition('=')
        if sep and key in KEYS:
            tokens.append(token_value(value))
        else:
            keep.append(line)
    if private is not None:
        for line in private.splitlines():
            if not line.strip() or line.strip().startswith('#'):
                continue
            key, sep, value = line.strip().partition('=')
            if not sep or key != 'TUNNEL_TOKEN':
                raise ValueError('Unexpected setting in private tunnel credential file')
            tokens.append(token_value(value))
    if tokens and len(set(tokens)) != 1:
        raise ValueError('Conflicting tunnel credentials; no value was printed')
    return ''.join(keep), ('TUNNEL_TOKEN=' + tokens[0] + '\n' if tokens else None)


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
    for name in ('compose.yaml', 'compose.local.yaml', 'compose.tunnel.yaml'):
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
    env, tunnel = DEPLOY / '.env', DEPLOY / '.env.cloudflared'
    if env.is_symlink() or tunnel.is_symlink():
        raise ValueError('Refusing symlinked application/tunnel credentials')
    shared = env.read_text()
    private = tunnel.read_text() if tunnel.exists() else None
    clean, isolated = isolate_tunnel(shared, private)
    if clean != shared:
        plans.append((env, clean.encode(), True))
    if isolated is not None:
        plans.append((tunnel, isolated.encode(), True))
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
    print('Reviewed Compose files and isolated tunnel credentials prepared; running database and ingress were not restarted')


if __name__ == '__main__':
    try:
        os.umask(0o077)
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        print(str(exc) if isinstance(exc, ValueError) else 'Host file preparation failed; private configuration backups were retained', file=sys.stderr)
        sys.exit(1)
