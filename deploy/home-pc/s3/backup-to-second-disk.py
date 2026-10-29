#!/usr/bin/env python3
"""USD local second-disk backup: RustFS media + live PG18 custom dump.

This backup is on another physical drive only when the Windows Hyper-V host
confirms the backup VHDX is stored on the HDD, not on the SSD hosting Ubuntu.
A second disk in the SAME PC is NOT an off-host disaster-recovery backup.
This tool never modifies production DB, S3 source, containers, deployment
configuration, DNS or the auto-deploy gate.
"""
import argparse
import configparser
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import stat
import subprocess
import sys
import tempfile
import time

BACKUP_MOUNT = Path("/srv/usd-backups")
SSD_MOUNT = Path("/srv/usd-s3")
S3_IAM = Path("/etc/usd-s3/api.env")
SOURCE = "usd-backup-source:usd-media"
POSTGRES_IMAGE = "postgres:18-alpine"
RESTORE_USER = "usd_restore"
LOCK = "/run/lock/usd-home-deploy.lock"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(argv, *, timeout=120, env=None, stdout=None):
    result = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=stdout or subprocess.PIPE,
                            stderr=subprocess.PIPE, env=env, timeout=timeout)
    if result.returncode:
        raise RuntimeError("Command failed: " + argv[0] + " (" +
                           str(result.returncode) + "); details withheld")
    return result.stdout.decode().strip() if stdout is None else ""


def check_mounts():
    require(os.geteuid() == 0, "Use sudo/root for private backup")
    for mount in (BACKUP_MOUNT, SSD_MOUNT):
        require(mount.is_mount() and not mount.is_symlink(), f"Required mount missing: {mount}")
    require(BACKUP_MOUNT.stat().st_dev != SSD_MOUNT.stat().st_dev,
            "Backup and S3 use same mounted filesystem")
    what = run(["findmnt", "-n", "-o", "SOURCE,FSTYPE", "--mountpoint", str(BACKUP_MOUNT)])
    fs_type = what.split()[-1] if what.split() else ""
    require(fs_type in ("ext4", "cifs"),
            "Expected dedicated ext4 VHDX or mounted Windows SMB/CIFS share")
    if fs_type == "cifs":
        require(what.startswith("//"), "Expected a dedicated UNC share on Windows HDD")
        # The VM cannot infer which PHYSICAL disk backs a Windows SMB share.
        # Operator must confirm the Windows share path is on the separate HDD.
        print("NOTICE: Verify this Windows SMB share is physically stored on the HDD.")
        print("NOTICE: Same-PC backup is NOT independent off-host recovery.")
    require(not (BACKUP_MOUNT/"snapshots").is_symlink(), "Unsafe backup snapshots symlink")
    return what


def read_iam():
    require(S3_IAM.is_file() and not S3_IAM.is_symlink(), "Restricted S3 keys not found")
    meta = S3_IAM.stat()
    require(meta.st_uid == 0 and not (stat.S_IMODE(meta.st_mode) & 0o077),
            "Restricted IAM file permissions unsafe")
    settings = {}
    for line in S3_IAM.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        tokens = shlex.split(line)
        require(len(tokens) == 1 and "=" in tokens[0], "Invalid private S3 environment")
        key, value = tokens[0].split("=", 1)
        require(key not in settings, "Duplicate S3 setting")
        settings[key] = value
    require(settings.get("S3_ACCESS_KEY_ID") and settings.get("S3_SECRET_ACCESS_KEY"),
            "Restricted S3 credentials missing")
    return settings


def temp_rclone_config(cred):
    handle, name = tempfile.mkstemp(prefix="usd-hdd-rclone-", dir="/run")
    try:
        config = configparser.RawConfigParser(interpolation=None)
        config.add_section("usd-backup-source")
        values = {
            "type": "s3", "provider": "Other", "env_auth": "false",
            "access_key_id": cred["S3_ACCESS_KEY_ID"],
            "secret_access_key": cred["S3_SECRET_ACCESS_KEY"],
            "region": "us-east-1", "endpoint": "http://127.0.0.1:19000",
            "force_path_style": "true",
        }
        for key, value in values.items():
            config.set("usd-backup-source", key, value)
        with os.fdopen(handle, "w") as file:
            config.write(file)
            file.flush()
            os.fsync(file.fileno())
        os.chmod(name, 0o600)
        return Path(name)
    except Exception:
        try:
            os.close(handle)
        except OSError:
            pass
        Path(name).unlink(missing_ok=True)
        raise


def rclone(config, args, *, timeout=1800):
    env = os.environ.copy()
    for key in list(env):
        if key.startswith(("AWS_", "RCLONE_")):
            del env[key]
    return run(["rclone", "--config", str(config), *args], env=env, timeout=timeout)


def pg_container():
    ids = run(["docker", "ps", "-q",
               "--filter", "label=com.docker.compose.project=usd-home",
               "--filter", "label=com.docker.compose.service=db"]).splitlines()
    require(len(ids) == 1, "Expected one running USD PostgreSQL")
    check = run(["docker", "inspect", "-f", "{{.State.Health.Status}}", ids[0]])
    require(check == "healthy", "Live PostgreSQL is not healthy")
    return ids[0]


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()


def sha_manifest(folder):
    result = {}
    for f in sorted(folder.rglob("*")):
        if f.is_symlink():
            raise RuntimeError("Symlink in backup media; refusing")
        if f.is_file():
            key = f.relative_to(folder).as_posix()
            result[key] = {"size": f.stat().st_size, "sha256": sha256(f)}
    return result


def verify_files(snapshot, manifest):
    require((snapshot/"database.dump").is_file(), "Missing PostgreSQL dump")
    require(sha256(snapshot/"database.dump") == manifest["database"]["sha256"],
            "PostgreSQL dump SHA256 mismatch")
    expected = manifest["media"]["files"]
    present = sha_manifest(snapshot/"media")
    require(present == expected, "Media files differ from saved SHA256 manifest")
    print("Verified backed-up media objects:", len(present))


def verify_pg_restore(snapshot):
    name = "usd-hdd-verify-" + secrets.token_hex(5)
    password = secrets.token_hex(24)
    launched = False
    try:
        run(["docker", "run", "-d", "--name", name, "--network", "none",
             "--memory", "768m", "--cpus", "1",
             "-e", f"POSTGRES_USER={RESTORE_USER}",
             "-e", f"POSTGRES_PASSWORD={password}",
             "-e", f"POSTGRES_DB={RESTORE_USER}",
             POSTGRES_IMAGE], timeout=90)
        launched = True
        for _ in range(90):
            ready = subprocess.run(["docker", "exec", name, "pg_isready", "-h",
                                    "127.0.0.1", "-U", RESTORE_USER, "-d", RESTORE_USER],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Disposable PG18 restore container never became ready")
        # Avoid binding a root-only HDD/CIFS archive into a PostgreSQL container:
        # its postgres user cannot read root-owned 0600 snapshots. Docker copies
        # into a disposable, offline container, where only that test DB sees it.
        run(["docker", "cp", str(snapshot/"database.dump"),
             name + ":/tmp/usd-restore.dump"], timeout=1800)
        run(["docker", "exec", "-u", "0", name, "chmod", "0644",
             "/tmp/usd-restore.dump"])
        run(["docker", "exec", name, "pg_restore", "--exit-on-error",
             "--no-owner", "--no-acl", "-U", RESTORE_USER,
             "-d", RESTORE_USER, "/tmp/usd-restore.dump"], timeout=1800)
        count = run(["docker", "exec", name, "psql", "-X", "-At", "-U",
                     RESTORE_USER, "-d", RESTORE_USER, "-c",
                     'SELECT COUNT(*) FROM "MediaUpload" WHERE "completedAt" IS NOT NULL'])
        require(count.isdigit() and int(count) > 0,
                "Restored PostgreSQL media inventory invalid")
        print("Disposable PostgreSQL 18 restore passed, completed media rows:", count)
    finally:
        if launched:
            proc = subprocess.run(["docker", "rm", "-fv", name],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if proc.returncode:
                print("CRITICAL: disposable PostgreSQL container cleanup failed: " + name,
                      file=sys.stderr)
                raise RuntimeError("Restore cleanup failed")


def check(args, config):
    source = rclone(config, ["size", "--json", SOURCE])
    data = json.loads(source)
    count, size = data.get("count"), data.get("bytes")
    require(isinstance(count, int) and count >= 68 and
            isinstance(size, int) and size > 0,
            "S3 source inventory does not include the migrated media")
    pg_container()
    require(run(["docker", "image", "inspect", POSTGRES_IMAGE]) != "",
            "PostgreSQL 18-alpine restore image must be present")
    free = os.statvfs(BACKUP_MOUNT)
    available = free.f_bavail * free.f_frsize
    require(available > size + 512 * 1024 * 1024,
            "Insufficient HDD free space for media and database")
    print("S3 objects:", count)
    print("S3 bytes:", size)
    print("Backup HDD available bytes:", available)
    print("CHECK SUCCESS: independent HDD filesystem mounted; no data changed")
    return count, size


def backup(config):
    count, size = check(None, config)
    root = BACKUP_MOUNT/"snapshots"
    root.mkdir(mode=0o700, exist_ok=True)
    require(not root.is_symlink(), "Unsafe backup directory")
    name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(3)
    staging = root / (name + ".incomplete")
    final = root / name
    staging.mkdir(mode=0o700)
    try:
        target = staging/"media"
        target.mkdir(mode=0o700)
        print("Backing up all S3 objects to second HDD...")
        rclone(config, ["copy", SOURCE, str(target), "--transfers", "3",
                        "--checkers", "4", "--immutable"])
        rclone(config, ["check", SOURCE, str(target), "--download"])
        media_files = sha_manifest(target)
        require(len(media_files) == count, "S3 object count changed during snapshot")
        require(sum(item["size"] for item in media_files.values()) == size,
                "S3 object size changed during snapshot")
        db = pg_container()
        dump = staging/"database.dump"
        print("Taking a consistent PostgreSQL 18 custom-format dump...")
        with dump.open("wb") as output:
            run(["docker", "exec", db, "sh", "-c",
                 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
                stdout=output, timeout=1800)
            output.flush()
            os.fsync(output.fileno())
        require(dump.stat().st_size > 0, "PostgreSQL dump empty")
        manifest = {
            "schema": 1,
            "created_utc": datetime.now(timezone.utc).isoformat(),
            "location": "second HDD in same Windows PC (NOT off-host)",
            "database": {"filename": "database.dump", "size": dump.stat().st_size,
                         "sha256": sha256(dump)},
            "media": {"count": count, "bytes": size, "files": media_files},
        }
        (staging/"manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        verify_files(staging, manifest)
        print("Rehearsing real restore into disposable PG18 container...")
        verify_pg_restore(staging)
        (staging/"VERIFIED").write_text("USD BACKUP VERIFIED\n")
        staging.rename(final)
        print("BACKUP SUCCESS: snapshot verified on the separate HDD")
        print("Snapshot:", final)
        print("Production DB/S3/containers and deploy gate unchanged")
    except Exception:
        print("Backup incomplete at:", staging, file=sys.stderr)
        print("The incomplete directory was preserved for inspection.", file=sys.stderr)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--check", action="store_true", help="Read-only inventory and disk checks")
    group.add_argument("--backup", action="store_true", help="Create and verify new HDD snapshot")
    group.add_argument("--verify", metavar="SNAPSHOT", help="Revalidate saved snapshot and restore PG18")
    args = parser.parse_args()
    mount = check_mounts()
    print("Backup mount:", mount)
    require(Path("/usr/bin/rclone").is_file() or Path("/usr/local/bin/rclone").is_file(),
            "rclone not installed")
    fd = os.open(LOCK, os.O_CREAT | os.O_WRONLY, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        raise RuntimeError("Deployment/backup lock already held, nothing changed")
    cfg = temp_rclone_config(read_iam())
    try:
        if args.verify:
            snap = Path(args.verify).resolve(strict=True)
            require(snap.parent == (BACKUP_MOUNT/"snapshots") and
                    (snap/"VERIFIED").is_file() and not snap.is_symlink(),
                    "Only completed snapshots on backup disk may be verified")
            manifest = json.loads((snap/"manifest.json").read_text())
            verify_files(snap, manifest)
            verify_pg_restore(snap)
            print("VERIFY SUCCESS: media SHA256 and PostgreSQL restore rechecked")
        elif args.backup:
            backup(cfg)
        else:
            check(args, cfg)
    finally:
        cfg.unlink(missing_ok=True)
        os.close(fd)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, json.JSONDecodeError,
            subprocess.TimeoutExpired, configparser.Error) as exc:
        print("HDD BACKUP STOPPED:", str(exc), file=sys.stderr)
        sys.exit(1)
