#!/usr/bin/env python3
"""Verify a fresh PostgreSQL dump on the dedicated USD second disk.

This is same-machine redundancy, NOT off-site disaster recovery. The caller
must still rehearse a full PostgreSQL restore before switching images.
"""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile

MOUNT = Path("/srv/usd-s3")
DEST = MOUNT / "backups" / "postgres"

def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.digest()

def verify_mount():
    result = subprocess.run(["findmnt", "-n", "-o", "SOURCE,FSTYPE", "--target", str(MOUNT)],
                            capture_output=True, text=True, check=True)
    fields = result.stdout.split()
    if len(fields) != 2 or fields[0] != "/dev/sdb1" or fields[1] != "ext4":
        raise RuntimeError("second disk identity mismatch; refusing backup")
    if MOUNT.is_symlink() or not MOUNT.is_mount():
        raise RuntimeError("second disk is not mounted")
    if os.stat(MOUNT).st_dev == os.stat("/").st_dev:
        raise RuntimeError("backup destination is on system filesystem")

def backup(source, label):
    verify_mount()
    source = Path(source)
    st = source.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_size == 0 or st.st_mode & 0o077:
        raise RuntimeError("source dump must be nonempty, root-owned and private")
    if not label.isalnum() or len(label) > 80:
        raise RuntimeError("invalid backup label")
    if DEST.is_symlink() or (DEST.exists() and os.stat(DEST).st_dev != os.stat(MOUNT).st_dev):
        raise RuntimeError("unsafe destination")
    DEST.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(DEST, 0o700)
    if DEST.stat().st_uid != 0:
        raise RuntimeError("backup directory must be root-owned")
    target = DEST / (label + ".dump")
    if target.exists() or target.is_symlink():
        raise RuntimeError("backup already exists; refusing overwrite")
    fd, temp = tempfile.mkstemp(prefix=".partial-", dir=DEST)
    try:
        with os.fdopen(fd, "wb") as output, source.open("rb") as input_file:
            shutil.copyfileobj(input_file, output, 1024 * 1024)
            output.flush()
            os.fsync(output.fileno())
        if digest(source) != digest(temp):
            raise RuntimeError("second disk copy checksum mismatch")
        subprocess.run(["pg_restore", "--list", temp], check=True, stdout=subprocess.DEVNULL)
        os.replace(temp, target)
        dir_fd = os.open(DEST, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
        if digest(source) != digest(target):
            raise RuntimeError("persisted backup checksum mismatch")
        print(f"Verified second-disk PostgreSQL backup: {target}")
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("label")
    args = parser.parse_args()
    try:
        backup(args.source, args.label)
    except (OSError, subprocess.CalledProcessError, RuntimeError) as exc:
        print(f"BLOCK: {exc}", file=sys.stderr)
        sys.exit(1)
