#!/usr/bin/env python3
"""Replace only the known Azure Ubuntu mirror on hosted Linux CI workers."""
import os
from pathlib import Path
import re
import stat
import sys

MIRRORS = Path('/etc/apt/apt-mirrors.txt')
AZURE = re.compile(r'(?m)^([ \t]*https?://)azure\.archive\.ubuntu\.com(?=/ubuntu(?:[/ \t\r\n]|$))')


def rewrite(path, environment):
    if not (environment.get('GITHUB_ACTIONS') == 'true'
            and environment.get('RUNNER_ENVIRONMENT') == 'github-hosted'
            and environment.get('RUNNER_OS') == 'Linux'):
        raise ValueError('Ubuntu mirror preparation requires a GitHub-hosted Linux worker')
    if not path.exists() and not path.is_symlink():
        return False  # Runners using ordinary Ubuntu sources need no change.
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError('Ubuntu mirror list must be a regular file, never a symlink')
    before = path.read_bytes()
    text = before.decode('utf-8')
    after = AZURE.sub(r'\1archive.ubuntu.com', text).encode('utf-8')
    if before == after:
        return False
    path.write_bytes(after)
    return True


if __name__ == '__main__':
    try:
        if len(sys.argv) != 1:
            raise ValueError('This CI helper accepts no alternate system paths')
        changed = rewrite(MIRRORS, os.environ)
        print('Prepared official Ubuntu archive mirror' if changed else 'Ubuntu mirror list needs no replacement')
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
