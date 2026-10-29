#!/usr/bin/env python3
"""Validate one recent verified local-HDD snapshot without changing any data.

This supports an EXPLICIT one-time prerelease with reduced disaster recovery.
A backup on another disk in the same Windows machine is NOT offsite.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

MOUNT = Path("/srv/usd-backups")
ROOT = MOUNT / "snapshots"


def require(ok, message):
    if not ok:
        raise ValueError(message)


def hash_file(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1048576), b""):
            value.update(block)
    return value.hexdigest()


def run(path):
    require(os.geteuid() == 0, "Only root may read USD backup")
    require(MOUNT.is_mount() and not MOUNT.is_symlink(), "Backup share is not mounted")
    source = subprocess.check_output(["findmnt", "-n", "-o", "SOURCE,FSTYPE",
                                      "--mountpoint", str(MOUNT)], text=True).strip()
    require(source.startswith("//") and source.endswith(" cifs"),
            "Expected Windows HDD SMB mount (not SSD or a local folder)")
    require(ROOT.is_dir() and not ROOT.is_symlink(), "Missing backup snapshots directory")
    snap = Path(path)
    require(snap.is_absolute() and snap.parent == ROOT and snap.name and
            re.fullmatch(r"\d{8}T\d{6}Z-[0-9a-f]{6}", snap.name) and
            snap.is_dir() and not snap.is_symlink(),
            "Snapshot must be a completed uniquely named HDD snapshot")
    proof = snap / "VERIFIED"
    require(proof.is_file() and not proof.is_symlink() and
            proof.read_text() == "USD BACKUP VERIFIED\n",
            "Snapshot has no verification receipt")
    require(time.time() - proof.stat().st_mtime < 10800 and
            proof.stat().st_mtime <= time.time() + 120,
            "Snapshot verification receipt is stale or from the future")
    mfile = snap / "manifest.json"
    require(mfile.is_file() and not mfile.is_symlink(), "Missing snapshot manifest")
    m = json.loads(mfile.read_text())
    require(m.get("schema") == 1 and m.get("location") ==
            "second HDD in same Windows PC (NOT off-host)", "Unexpected backup provenance")
    database = snap / "database.dump"
    require(database.is_file() and not database.is_symlink() and
            database.stat().st_size > 1024 and
            database.stat().st_size == m["database"]["size"] and
            hash_file(database) == m["database"]["sha256"],
            "PostgreSQL backup missing or hash mismatch")
    media = snap / "media"
    require(media.is_dir() and not media.is_symlink(), "Media backup directory missing")
    expected = m["media"]["files"]
    require(isinstance(expected, dict) and len(expected) == m["media"]["count"] and
            len(expected) >= 68 and m["media"]["bytes"] > 0,
            "Insufficient or malformed media inventory")
    seen = set()
    for key, details in expected.items():
        require(key.startswith("usd/") and ".." not in Path(key).parts,
                "Invalid object key in manifest")
        item = media / key
        require(item.is_file() and not item.is_symlink() and
                item.stat().st_size == details["size"] and
                hash_file(item) == details["sha256"],
                "One media object is missing or corrupt")
        seen.add(key)
    actual = {p.relative_to(media).as_posix() for p in media.rglob("*") if p.is_file()}
    require(actual == seen, "Extra or missing media files in backup")
    require(sum(v["size"] for v in expected.values()) == m["media"]["bytes"],
            "Total media size mismatch")
    print("LOCAL HDD VERIFIED: media", len(seen),
          "PostgreSQL archive SHA256 valid; SAME-PC risk remains")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: verify-local-hdd-snapshot.py /srv/usd-backups/snapshots/<verified-snapshot>")
        run(sys.argv[1])
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.CalledProcessError) as exc:
        print("LOCAL HDD BACKUP REFUSED:", str(exc), file=sys.stderr)
        sys.exit(1)
