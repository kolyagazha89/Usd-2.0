#!/usr/bin/env python3
"""Non-destructive Backblaze B2 -> private RustFS media migration for USD.

Modes: inspect (read-only source/db/destination), copy (no overwrite, verifies
each object's SHA256 at destination), verify (read-only byte-for-byte check).
No writes to PostgreSQL and no remote deletes, even on failure.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile

SOURCE_ENDPOINT = "https://s3.us-east-005.backblazeb2.com"
DEST_ENDPOINT = "http://127.0.0.1:19000"
BUCKET = "usd-media"
SOURCE_PROFILE = "usd-b2"
IAM_FILE = Path("/etc/usd-s3/api.env")
AWS = "/usr/local/bin/aws"
MAX_OBJECT_BYTES = 128 * 1024 * 1024


def fail(message):
    raise RuntimeError(message)


def run(command, *, env=None, timeout=240, binary=False):
    return subprocess.run(command, env=env, capture_output=True,
                          text=not binary, timeout=timeout)


def cli_env():
    env = os.environ.copy()
    for key in list(env):
        if key.startswith("AWS_"):
            env.pop(key, None)
    env.update(AWS_EC2_METADATA_DISABLED="true", AWS_PAGER="")
    return env


def local_env():
    if IAM_FILE.is_symlink() or not IAM_FILE.is_file():
        fail("Missing or symlinked /etc/usd-s3/api.env")
    info = IAM_FILE.stat()
    if info.st_uid != 0 or info.st_mode & 0o077:
        fail("Private IAM file must belong to root and have mode 0600")
    settings = {}
    for line in IAM_FILE.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        tokens = shlex.split(line)
        if len(tokens) != 1 or "=" not in tokens[0]:
            fail("Malformed IAM file")
        key, value = tokens[0].split("=", 1)
        if key in settings:
            fail("Duplicate IAM setting")
        settings[key] = value
    if not settings.get("S3_ACCESS_KEY_ID") or not settings.get("S3_SECRET_ACCESS_KEY"):
        fail("Restricted IAM keys missing")
    env = cli_env()
    env.update(AWS_ACCESS_KEY_ID=settings["S3_ACCESS_KEY_ID"],
               AWS_SECRET_ACCESS_KEY=settings["S3_SECRET_ACCESS_KEY"],
               AWS_DEFAULT_REGION="us-east-1")
    return env


def aws(which, args, *, json_result=True, timeout=240, allow_missing=False):
    if which == "b2":
        env = cli_env()
        command = [AWS, "--profile", SOURCE_PROFILE, "--region", "us-east-005"]
        endpoint = SOURCE_ENDPOINT
    else:
        env = local_env()
        command = [AWS, "--region", "us-east-1"]
        endpoint = DEST_ENDPOINT
    command += ["--no-cli-pager", "--endpoint-url", endpoint, "s3api", *args]
    if json_result:
        command += ["--output", "json"]
    result = run(command, env=env, timeout=timeout)
    if result.returncode:
        text = result.stderr
        if allow_missing and re.search(r"\((404|NoSuchKey|NotFound|Not Found)\)", text):
            return None
        fail("S3 " + which + " operation failed (" + args[0] +
             ", exit " + str(result.returncode) + "). Verify credentials, "
             "permissions, endpoint and network; details withheld to protect keys.")
    if not json_result:
        return None
    return json.loads(result.stdout) if result.stdout.strip() else {}


def database_media():
    ids = run(["docker", "ps", "-q",
               "--filter", "label=com.docker.compose.project=usd-home",
               "--filter", "label=com.docker.compose.service=db"])
    dbids = ids.stdout.decode().split() if isinstance(ids.stdout, bytes) else ids.stdout.split()
    if ids.returncode or len(dbids) != 1:
        fail("Expected exactly one running USD PostgreSQL container")
    sql = ('SELECT "objectKey", "contentType" FROM "MediaUpload" '
           'WHERE "completedAt" IS NOT NULL ORDER BY "objectKey"')
    command = ["docker", "exec", dbids[0], "sh", "-c",
               'exec psql -X -q -A -t -F "|" -v ON_ERROR_STOP=1 '
               '-U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"', "_", sql]
    result = run(command)
    if result.returncode:
        fail("Cannot read production MediaUpload inventory (no DB writes attempted)")
    rows = {}
    for line in result.stdout.splitlines():
        key, sep, content_type = line.partition("|")
        if not sep or not key.startswith("usd/") or ".." in key.split("/"):
            fail("Unexpected media key from database")
        if key in rows:
            fail("Duplicate media object key in database")
        rows[key] = content_type
    if not rows:
        fail("Production MediaUpload inventory is empty; refusing migration")
    return rows


def list_objects():
    result = {}
    continuation = None
    while True:
        args = ["list-objects-v2", "--bucket", BUCKET, "--prefix", "usd/",
                "--max-keys", "500", "--no-paginate"]
        if continuation:
            args += ["--continuation-token", continuation]
        page = aws("b2", args)
        for item in page.get("Contents", []):
            key = item["Key"]
            if key in result:
                fail("Duplicate key in B2 pagination")
            result[key] = int(item["Size"])
        continuation = page.get("NextContinuationToken")
        if not continuation:
            if page.get("IsTruncated"):
                fail("B2 listing truncated without continuation token")
            break
    return result


def s3_head(which, key, missing=False):
    return aws(which, ["head-object", "--bucket", BUCKET, "--key", key],
               allow_missing=missing)


def sha256_file(filename):
    hasher = hashlib.sha256()
    with open(filename, "rb") as handle:
        for part in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(part)
    return hasher.hexdigest()


def download(which, key, filename):
    aws(which, ["get-object", "--bucket", BUCKET, "--key", key, str(filename)],
        timeout=600)


def verify_pair(key, source_meta, expected_type, directory, *, upload=False):
    content_type = source_meta.get("ContentType") or "application/octet-stream"
    if expected_type and content_type.lower() != expected_type.lower():
        fail("Source Content-Type differs from database record; refusing to "
             "change metadata implicitly")
    size = int(source_meta.get("ContentLength", -1))
    if size < 1 or size > MAX_OBJECT_BYTES:
        fail("Object size invalid or exceeds migration safety limit")
    source_file = directory / "source"
    dest_file = directory / "destination"
    download("b2", key, source_file)
    if source_file.stat().st_size != size:
        fail("B2 object size changed during download")
    src_hash = sha256_file(source_file)
    destination_meta = s3_head("local", key, missing=True)
    if destination_meta is None:
        if not upload:
            fail("Destination is missing a source object")
        aws("local", ["put-object", "--bucket", BUCKET, "--key", key,
                      "--body", str(source_file), "--content-type", content_type],
            timeout=600)
        destination_meta = s3_head("local", key)
    if int(destination_meta.get("ContentLength", -1)) != size:
        fail("Destination object size mismatch; existing object NOT overwritten")
    if (destination_meta.get("ContentType") or "").lower() != content_type.lower():
        fail("Destination content type mismatch; existing object NOT overwritten")
    download("local", key, dest_file)
    if sha256_file(dest_file) != src_hash:
        fail("Destination SHA256 mismatch; object NOT overwritten")
    source_file.unlink()
    dest_file.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("inspect", "copy", "verify"),
                        nargs="?", default="inspect")
    args = parser.parse_args()
    if os.geteuid() != 0:
        fail("Run as root with sudo (only root can read migration credentials)")
    if not Path("/srv/usd-s3").is_mount():
        # Path.is_mount() is Python 3.12+
        fail("Expected existing mounted S3 SSD at /srv/usd-s3")
    if not Path(AWS).is_file():
        fail("AWS CLI v2 missing")
    records = database_media()
    listing = list_objects()
    missing = set(records) - set(listing)
    extra = set(listing) - set(records)
    total_bytes = sum(listing.values())
    print("Database completed uploads:", len(records))
    print("Backblaze B2 objects under usd/:", len(listing))
    print("Backblaze B2 bytes:", total_bytes)
    print("DB keys missing in Backblaze:", len(missing))
    print("Extra source objects preserved (historic/unreferenced):", len(extra))
    # Query destination even in inspect mode to detect accidentally misconfigured IAM.
    aws("local", ["head-bucket", "--bucket", BUCKET])
    if missing:
        fail("Source does not contain every DB object; do not switch application S3")
    if not listing:
        fail("Source is empty; refusing migration")
    # Compare type metadata for referenced objects before any destination writes.
    for key in sorted(records):
        meta = s3_head("b2", key)
        actual = (meta.get("ContentType") or "application/octet-stream").lower()
        if actual != records[key].lower():
            fail("At least one B2 object MIME type differs from DB; review before copying")
    print("All DB keys exist in B2 with matching MIME types.")
    if args.mode == "inspect":
        print("INSPECT SUCCESS: source available; no objects copied, no DB changes.")
        return
    print("Processing each object with SHA256 source/destination verification...")
    with tempfile.TemporaryDirectory(prefix=".usd-b2-migrate-",
                                     dir="/srv/usd-s3") as directory:
        temp = Path(directory)
        for index, key in enumerate(sorted(listing), 1):
            meta = s3_head("b2", key)
            verify_pair(key, meta, records.get(key), temp, upload=args.mode == "copy")
            if index % 10 == 0 or index == len(listing):
                print("Verified:", index, "/", len(listing), flush=True)
    print(args.mode.upper() + " SUCCESS: all source objects verified byte-for-byte.")
    print("No source objects, PostgreSQL data or public DNS were changed.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.TimeoutExpired, ValueError) as exc:
        print("MIGRATION STOPPED:", str(exc), file=sys.stderr)
        sys.exit(1)
