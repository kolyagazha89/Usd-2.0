#!/usr/bin/env python3
"""Fail-closed local RustFS data copy before USD releases.

This is a same-disk copy for accidental-deletion recovery, NOT protection
against failure of /dev/sdb1 or the entire PC.
"""
import hashlib
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys

MOUNT = Path("/srv/usd-s3")
SOURCE = MOUNT / "data"
DEST = MOUNT / "backups" / "rustfs"

def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1048576), b""):
            value.update(chunk)
    return value.digest()

def run(label):
    if os.geteuid() != 0:
        raise RuntimeError("root required")
    source = subprocess.check_output(
        ["findmnt", "-n", "-o", "SOURCE", "--mountpoint", str(MOUNT)], text=True
    ).strip()
    if source != "/dev/sdb1" or not MOUNT.is_mount() or MOUNT.is_symlink():
        raise RuntimeError("second disk mount identity mismatch")
    if not label.isalnum() or len(label) > 80:
        raise RuntimeError("invalid snapshot label")
    if SOURCE.is_symlink() or not SOURCE.is_dir():
        raise RuntimeError("RustFS source missing or unsafe")
    files = sorted(p for p in SOURCE.rglob("*") if p.is_file() or p.is_symlink())
    if not files:
        raise RuntimeError("RustFS source has no files")
    if any(p.is_symlink() or not stat.S_ISREG(p.lstat().st_mode) for p in files):
        raise RuntimeError("RustFS source contains unsupported file types")
    if DEST.is_symlink() or DEST.parent.is_symlink():
        raise RuntimeError("unsafe backup directory")
    DEST.mkdir(parents=True, exist_ok=True, mode=0o700)
    if DEST.stat().st_uid != 0:
        raise RuntimeError("backup directory must be root-owned")
    os.chmod(DEST, 0o700)
    target = DEST / label
    target.mkdir(mode=0o700)
    try:
        for item in files:
            relative = item.relative_to(SOURCE)
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with item.open("rb") as input_file, destination.open("xb") as output:
                shutil.copyfileobj(input_file, output, 1048576)
                output.flush()
                os.fsync(output.fileno())
            if digest(item) != digest(destination):
                raise RuntimeError("RustFS data changed during backup or checksum mismatch")
        if {p.relative_to(SOURCE) for p in files} != {
            p.relative_to(target) for p in target.rglob("*") if p.is_file()
        }:
            raise RuntimeError("RustFS file inventory changed during backup")
        print(f"Verified same-disk RustFS copy: {len(files)} files")
    except BaseException:
        shutil.rmtree(target)
        raise

if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise RuntimeError("usage: verify-second-disk-media-backup.py LABEL")
        run(sys.argv[1])
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"BLOCK: {exc}", file=sys.stderr)
        sys.exit(1)
