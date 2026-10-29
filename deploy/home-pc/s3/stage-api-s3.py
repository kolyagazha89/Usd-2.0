#!/usr/bin/env python3
"""Preflight and explicitly stage USD's private RustFS configuration.

Never restarts containers, migrates PostgreSQL, deletes files, changes DNS,
or enables the auto-deployer. --check is strictly read-only.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tempfile

DEPLOY = Path("/home/usd/usd-deploy/deploy/home-pc")
ENV = DEPLOY / ".env"
IAM_FILE = Path("/etc/usd-s3/api.env")
SSD = Path("/srv/usd-s3")
AWS = "/usr/local/bin/aws"
S3_ENV = {
    "S3_ENDPOINT": "http://usd-s3:9000",
    "S3_REGION": "us-east-1",
    "S3_BUCKET": "usd-media",
    "S3_FORCE_PATH_STYLE": "true",
}
S3_KEYS = set(S3_ENV) | {"S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"}
ENV_LINE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=")


def require(ok, text):
    if not ok:
        raise RuntimeError(text)


def command(argv, *, env=None, timeout=120):
    p = subprocess.run(argv, capture_output=True, text=True,
                       timeout=timeout, env=env)
    if p.returncode:
        raise RuntimeError("Check failed: " + argv[0] +
                           " (exit " + str(p.returncode) + "; details withheld)")
    return p.stdout


def read_private_iam():
    require(IAM_FILE.is_file() and not IAM_FILE.is_symlink(), "Missing private IAM file")
    st = IAM_FILE.stat()
    require(st.st_uid == 0 and stat.S_IMODE(st.st_mode) & 0o077 == 0,
            "IAM file must be root-owned and mode 0600")
    parsed = {}
    for raw in IAM_FILE.read_text().splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        tokens = shlex.split(raw)
        require(len(tokens) == 1 and "=" in tokens[0], "Malformed IAM file")
        key, value = tokens[0].split("=", 1)
        require(key not in parsed, "Duplicate IAM key")
        parsed[key] = value
    for key in ("S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"):
        value = parsed.get(key, "")
        require(re.fullmatch(r"[A-Za-z0-9_+./:=-]{5,256}", value) is not None,
                "IAM key contains .env-unsafe characters; refuse automatic staging")
    return {key: parsed[key] for key in ("S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY")}


def db_keys():
    dbs = command(["docker", "ps", "-q",
                   "--filter", "label=com.docker.compose.project=usd-home",
                   "--filter", "label=com.docker.compose.service=db"]).splitlines()
    require(len(dbs) == 1, "Expected exactly one running PostgreSQL container")
    sql = 'SELECT "objectKey" FROM "MediaUpload" WHERE "completedAt" IS NOT NULL ORDER BY "objectKey"'
    result = command(["docker", "exec", dbs[0], "sh", "-c",
                      'exec psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"',
                      "_", sql])
    values = [v.strip() for v in result.splitlines() if v.strip()]
    require(values and all(v.startswith("usd/") for v in values),
            "Unexpected or missing completed media keys in PostgreSQL")
    require(len(values) == len(set(values)), "Duplicate media object keys")
    return set(values)


def s3_keys(private):
    env = os.environ.copy()
    for key in list(env):
        if key.startswith("AWS_"):
            del env[key]
    env.update(AWS_ACCESS_KEY_ID=private["S3_ACCESS_KEY_ID"],
               AWS_SECRET_ACCESS_KEY=private["S3_SECRET_ACCESS_KEY"],
               AWS_DEFAULT_REGION="us-east-1",
               AWS_EC2_METADATA_DISABLED="true", AWS_PAGER="")
    args = [AWS, "--endpoint-url", "http://127.0.0.1:19000",
            "--no-cli-pager", "s3api", "list-objects-v2",
            "--bucket", "usd-media", "--prefix", "usd/",
            "--max-keys", "500", "--no-paginate", "--output", "json"]
    found = set()
    continuation = None
    while True:
        cmd = args + (["--continuation-token", continuation] if continuation else [])
        page = json.loads(command(cmd, env=env))
        for item in page.get("Contents", []):
            require(item["Key"] not in found, "Duplicate S3 key")
            found.add(item["Key"])
        continuation = page.get("NextContinuationToken")
        require(not (page.get("IsTruncated") and not continuation),
                "RustFS list truncated without continuation token")
        if not continuation:
            break
    return found


def prepare_env(private):
    require(ENV.is_file() and not ENV.is_symlink(), "Existing application .env missing")
    st = ENV.stat()
    require(stat.S_IMODE(st.st_mode) & 0o077 == 0,
            "Application .env must be accessible only to its owner")
    lines = ENV.read_text().splitlines(keepends=True)
    found = set()
    existing = {}
    result = []
    for line in lines:
        match = ENV_LINE.match(line)
        key = match.group(1) if match else None
        if key in S3_KEYS:
            require(key not in found, "Duplicate existing " + key + " key")
            found.add(key)
            existing[key] = line
        else:
            result.append(line)
    # Preserve every non-S3 setting verbatim, including DB/domain/image identity.
    if result and not result[-1].endswith("\n"):
        result[-1] += "\n"
    result.append("\n# USD private RustFS - staged without restarting live containers\n")
    for key, val in {**S3_ENV, **private}.items():
        result.append(key + "=" + val + "\n")
    if "APP_DOMAIN" not in ENV.read_text() or "API_DOMAIN" not in ENV.read_text():
        raise RuntimeError("Missing application domain config; do not stage")
    return "".join(result).encode(), st


def compose_validate(content):
    # Validate with a temporary private env file; never change the active .env.
    fd, path = tempfile.mkstemp(prefix=".usd-s3-validation-", dir=DEPLOY)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as out:
            out.write(content)
        command(["docker", "compose", "--project-directory", str(DEPLOY),
                 "-f", str(DEPLOY / "compose.yaml"),
                 "--env-file", path, "config", "--quiet"])
    finally:
        Path(path).unlink(missing_ok=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true",
                   help="Atomically update .env after checks, but do NOT restart any container")
    args = p.parse_args()
    require(os.geteuid() == 0, "Run as root via sudo")
    require(SSD.is_mount(), "SSD is not mounted; refusing S3 changes")
    require(Path(AWS).is_file(), "AWS CLI is missing")
    require(Path("/etc/usd-s3/compose.yaml").is_file(), "RustFS stack missing")
    private = read_private_iam()
    db = db_keys()
    local = s3_keys(private)
    missing = db - local
    print("Completed database uploads:", len(db))
    print("RustFS objects under usd/:", len(local))
    print("Database media keys missing in RustFS:", len(missing))
    require(not missing, "Some old media keys are missing from RustFS")
    require(len(local) >= len(db), "RustFS inventory incomplete")
    api = command(["docker", "ps", "-q",
                   "--filter", "label=com.docker.compose.project=usd-home",
                   "--filter", "label=com.docker.compose.service=api"]).splitlines()
    require(len(api) == 1, "Expected exactly one running USD API")
    command(["docker", "exec", api[0], "node", "-e",
             "fetch('http://usd-s3:9000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"])
    print("Live API can reach private RustFS: yes")
    labels = command(["docker", "inspect", "-f",
                      '{{ index .Config.Labels "com.docker.compose.project.config_files" }}',
                      api[0]]).strip()
    overlay_names = [Path(part).name for part in labels.split(",")]
    unsupported = sorted(set(overlay_names) - {"compose.yaml", "compose.local.yaml"})
    print("Running ingress overlay requires review:", "yes" if unsupported else "no")
    print("Independent media backup policy configured:",
          "yes" if Path("/etc/usd-deployer/media-backup.conf").is_file() else "no")
    print("Independent DB backup policy configured:",
          "yes" if Path("/etc/usd-deployer/db-backup.conf").is_file() else "no")
    prepared, oldstat = prepare_env(private)
    compose_validate(prepared)
    print("Candidate .env validates with Docker Compose: yes")
    if not args.apply:
        print("CHECK SUCCESS: no configuration, containers or database changed")
        return
    require(not Path("/etc/usd-deploy-enabled").exists(),
            "Automatic deployment enabled; disable via supervised review before editing .env")
    backup_dir = Path("/etc/usd-s3")
    backup = backup_dir / ("usd-app-env-before-s3-" +
                           datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".bak")
    require(not backup.exists(), "Refusing to overwrite existing env backup")
    # Snapshot original mode, owner, bytes without printing any credential.
    original = ENV.read_bytes()
    fd, path = tempfile.mkstemp(prefix=".usd-s3-appenv-", dir=DEPLOY)
    try:
        os.fchmod(fd, 0o600)
        os.fchown(fd, oldstat.st_uid, oldstat.st_gid)
        with os.fdopen(fd, "wb") as out:
            out.write(prepared)
            out.flush()
            os.fsync(out.fileno())
        bfd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(bfd, "wb") as outfile:
                outfile.write(original)
                outfile.flush()
                os.fsync(outfile.fileno())
        except Exception:
            backup.unlink(missing_ok=True)
            raise
        # Atomic replace on same filesystem. Running containers stay unchanged.
        os.replace(path, ENV)
    finally:
        Path(path).unlink(missing_ok=True)
    print("STAGED SUCCESS: private RustFS settings saved to existing .env")
    print("Original application .env backed up under /etc/usd-s3 (root-only)")
    print("No service or PostgreSQL restarted; production cutover NOT performed")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired,
            json.JSONDecodeError, UnicodeError) as exc:
        print("S3 staging stopped:", str(exc), file=sys.stderr)
        sys.exit(1)
