#!/usr/bin/env python3
"""Supervised setup of independent B2 backups for local USD RustFS and PostgreSQL.

Requires a *new* B2 bucket 'usd-backups' and a separately scoped B2 application
key added as root's AWS CLI profile 'usd-b2-backup'. Never modifies production
.env, Docker containers, PostgreSQL data, DNS, or deployment enablement.
"""
import configparser
import datetime
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tempfile
import uuid

BUCKET = "usd-backups"
SOURCE = "usd-rustfs-backup-source"
DEST = "usd-b2-offsite"
POLICY_DIR = Path("/etc/usd-deployer")
CONF = Path("/root/.config/rclone/rclone.conf")
IAM_FILE = Path("/etc/usd-s3/api.env")
AWS_CREDENTIALS = Path("/root/.aws/credentials")
AWS_CONFIG = Path("/root/.aws/config")
B2_PROFILE = "usd-b2-backup"
ENDPOINT = "https://s3.us-east-005.backblazeb2.com"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def check_private(path):
    require(path.is_file() and not path.is_symlink(), f"Missing/unsafe {path}")
    st = path.stat()
    require(st.st_uid == 0 and stat.S_IMODE(st.st_mode) & 0o077 == 0,
            f"{path} must belong to root and be private")
    return st


def command(args, *, config=None):
    env = os.environ.copy()
    for k in list(env):
        if k.startswith(("AWS_", "RCLONE_")):
            del env[k]
    args = list(args)
    if config is not None:
        args += ["--config", str(config)]
    p = subprocess.run(args, capture_output=True, text=True, env=env, timeout=120)
    require(p.returncode == 0,
            "Connectivity test failed (" + args[0] +
            "); check B2 key/bucket/region/network. Sensitive output omitted.")
    return p.stdout


def parse_env():
    check_private(IAM_FILE)
    found = {}
    for line in IAM_FILE.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = shlex.split(line)
        require(len(parts) == 1 and "=" in parts[0], "Invalid restricted IAM file")
        k, v = parts[0].split("=", 1)
        require(k not in found, "Duplicate restricted IAM key")
        found[k] = v
    return found


def b2_credentials():
    check_private(AWS_CREDENTIALS)
    cfg = configparser.RawConfigParser(interpolation=None)
    cfg.read(AWS_CREDENTIALS)
    require(cfg.has_section(B2_PROFILE), "Configure B2 profile: sudo aws configure --profile usd-b2-backup")
    access = cfg.get(B2_PROFILE, "aws_access_key_id", fallback="")
    secret = cfg.get(B2_PROFILE, "aws_secret_access_key", fallback="")
    require(bool(access and secret), "Backblaze backup key is missing")
    return access, secret


def config_writer(local, remote):
    conf = configparser.RawConfigParser(interpolation=None)
    conf.optionxform = str
    if CONF.exists():
        check_private(CONF)
        conf.read(CONF)
    for name in (SOURCE, DEST):
        require(not conf.has_section(name),
                f"rclone remote {name!r} already exists; refuse to overwrite")
    conf.add_section(SOURCE)
    for k, v in {
        "type":"s3", "provider":"Other", "env_auth":"false",
        "access_key_id":local["S3_ACCESS_KEY_ID"],
        "secret_access_key":local["S3_SECRET_ACCESS_KEY"],
        "region":"us-east-1", "endpoint":"http://127.0.0.1:19000",
        "force_path_style":"true"
    }.items():
        conf.set(SOURCE,k,v)
    conf.add_section(DEST)
    for k,v in {
        "type":"s3", "provider":"Other", "env_auth":"false",
        "access_key_id":remote[0], "secret_access_key":remote[1],
        "region":"us-east-005", "endpoint":ENDPOINT,
        "force_path_style":"true"
    }.items():
        conf.set(DEST,k,v)
    CONF.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(not CONF.is_symlink(), "Refusing symlinked rclone config")
    fd, temporary = tempfile.mkstemp(dir=str(CONF.parent), prefix=".usd-rclone-")
    try:
        with os.fdopen(fd,"w") as target:
            conf.write(target)
            target.flush()
            os.fsync(target.fileno())
        os.chmod(temporary,0o600)
        return Path(temporary)
    except Exception:
        Path(temporary).unlink(missing_ok=True)
        raise


def preflight(path):
    source = json.loads(command(["rclone", "size", "--json",
                                 f"{SOURCE}:usd-media"], config=path))
    count = source.get("count")
    require(isinstance(count,int) and count >= 68,
            "Local media inventory is incomplete; refusing backup setup")
    command(["rclone", "lsf", f"{DEST}:{BUCKET}"], config=path)
    print(f"Local RustFS objects: {count}")
    print("Separate Backblaze backup bucket accessible: yes")


def write_config(path):
    if CONF.exists():
        require(not CONF.is_symlink(), "Refusing symlinked rclone config")
        backup = CONF.with_name("rclone.conf.usd-before-" +
                               datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
        require(not backup.exists(), "Backup configuration already exists")
        backup.write_bytes(CONF.read_bytes())
        backup.chmod(0o600)
    os.replace(path, CONF)


def write_policy(path, lines):
    require(not path.is_symlink(), f"Refusing symlinked policy {path}")
    content = "".join(line+"\n" for line in lines)
    if path.exists():
        check_private(path)
        require(path.read_text() == content,
                f"Existing {path} differs; operator must review it, not overwrite")
        return
    fd = os.open(path, os.O_CREAT|os.O_EXCL|os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())


def main():
    require(os.geteuid() == 0, "Root is required")
    require(Path("/srv/usd-s3").is_mount(), "SSD is not mounted")
    require(not Path("/etc/usd-deploy-enabled").exists(),
            "Auto-deploy must remain paused")
    require(Path("/usr/bin/rclone").is_file() or Path("/usr/local/bin/rclone").is_file(),
            "Install rclone first: sudo apt-get install -y rclone")
    require(POLICY_DIR.is_dir() and not POLICY_DIR.is_symlink(),
            "Deployment policy directory missing or unsafe")
    check_private(IAM_FILE)
    local = parse_env()
    require(local.get("S3_ACCESS_KEY_ID") and local.get("S3_SECRET_ACCESS_KEY"),
            "Restricted local S3 keys missing")
    remote = b2_credentials()
    path = config_writer(local, remote)
    try:
        preflight(path)
        # Probe writes to only a new backup-key test path, then reads the same
        # object. Keep the tiny audit marker, preserving append-only IAM setups.
        with tempfile.TemporaryDirectory(prefix=".usd-offsite-probe-") as td:
            datum = Path(td) / "probe.txt"
            datum.write_text("USD backup connectivity test\n")
            prefix = "backups/usd/healthchecks/" + uuid.uuid4().hex + ".txt"
            target = f"{DEST}:{BUCKET}/{prefix}"
            command(["rclone","copyto",str(datum),target,"--immutable"],config=path)
            check = command(["rclone","cat",target],config=path)
            require(check == datum.read_text(),
                    "Off-host probe content mismatch, refusing backup policies")
        write_config(path)
    finally:
        path.unlink(missing_ok=True)
    write_policy(POLICY_DIR / "media-backup.conf",
                 [f"{SOURCE}:usd-media",
                  f"{DEST}:{BUCKET}/backups/usd/media"])
    write_policy(POLICY_DIR / "db-backup.conf",
                 [f"{DEST}:{BUCKET}/backups/usd/postgres"])
    print("OFFSITE CONFIGURED: root-only rclone remotes and backup policies")
    print("A remote probe was written/read without deletion.")
    print("No production containers, DB, site URLs or deploy gate changed.")
    print("Next: run actual media backup/restore and PostgreSQL dump/offsite restore tests.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.TimeoutExpired,
            configparser.Error, json.JSONDecodeError) as exc:
        print("OFFSITE SETUP STOPPED:", str(exc), file=sys.stderr)
        sys.exit(1)
