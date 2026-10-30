#!/usr/bin/env python3
"""Read-only USD Ubuntu release readiness assessment.

Never prints secret contents, runs migrations, or changes Docker state.
Exit 0 only if every mandatory gate is ready; 1 otherwise.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path

SHA = re.compile(r"^[a-f0-9]{40}$")
REQUIRED_UNITS = ("usd-auto-deploy.timer", "docker.service")
POLICIES = (
    "etc/usd-deploy-enabled",
    "etc/usd-auto-release-schema",
    "etc/usd-deployer/db-backup.conf",
    "etc/usd-deployer/media-backup.conf",
)
TOOLS = ("docker", "git", "rclone", "systemctl", "flock")
COSIGN_SHA256 = "4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71"


def check_private_file(root, relative, *, require_private=False):
    path = root / relative
    if path.is_symlink() or not path.is_file():
        return False, "missing or symlink"
    info = path.stat()
    if info.st_uid != 0:
        return False, "not root-owned"
    if info.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
        return False, "writable by group/other"
    if require_private and info.st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        return False, "readable or accessible by group/other"
    return True, "valid"


def run(command):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=12, check=False)
        return result.returncode == 0, result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return False, ""


def assess(root=Path("/"), live=False):
    checks = []

    def add(name, ok, detail):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    for tool in TOOLS:
        add("tool:" + tool, shutil.which(tool) is not None, "available" if shutil.which(tool) else "missing")

    for relative in POLICIES:
        ok, detail = check_private_file(root, relative, require_private=relative.endswith(".conf"))
        add("policy:" + relative, ok, detail)

    schema_file = root / "etc/usd-auto-release-schema"
    try:
        schema = schema_file.read_text(encoding="ascii").strip()
    except (OSError, UnicodeError):
        schema = ""
    add("schema-pin", bool(SHA.fullmatch(schema)), "valid tree SHA" if SHA.fullmatch(schema) else "missing/invalid SHA")

    env_path = root / "home/usd/usd-deploy/deploy/home-pc/.env"
    ok, detail = check_private_file(root, "home/usd/usd-deploy/deploy/home-pc/.env", require_private=True)
    add("deploy-env", ok, detail)
    try:
        env_text = env_path.read_text(encoding="utf-8") if ok else ""
        tags = re.findall(r"^USD_IMAGE_TAG=([a-f0-9]{40})$", env_text, re.M)
    except (OSError, UnicodeError):
        tags = []
    add("deployed-image-pin", len(tags) == 1, "valid immutable SHA" if len(tags) == 1 else "missing/invalid SHA")

    media_policy = root / "etc/usd-deployer/media-backup.conf"
    try:
        lines = media_policy.read_text(encoding="utf-8").splitlines()
        remotes = [line.split(":", 1)[0] for line in lines if re.fullmatch(r"[A-Za-z0-9_-]+:.+", line)]
        valid_media = len(lines) == 2 and len(remotes) == 2 and remotes[0] != remotes[1]
    except (OSError, UnicodeError):
        valid_media = False
    add("media-offhost-policy", valid_media, "distinct remotes" if valid_media else "missing/invalid remote pair")

    # The deployer sources this policy in a supervised release. Only verify
    # existence/ownership here; never echo or parse secrets into the report.
    db_policy_ok, _ = check_private_file(root, "etc/usd-deployer/db-backup.conf", require_private=True)
    add("db-offhost-policy", db_policy_ok, "trusted private file" if db_policy_ok else "missing/untrusted configuration")

    verifier = root / "usr/local/libexec/usd-verify-media-backup"
    trusted_verifier, detail = check_private_file(root, "usr/local/libexec/usd-verify-media-backup")
    trusted_verifier = trusted_verifier and os.access(verifier, os.X_OK)
    add("media-backup-verifier", trusted_verifier, detail if trusted_verifier else "missing, untrusted or not executable")
    release_helper = root / "usr/local/sbin/usd-release-approved"
    trusted_helper, detail = check_private_file(root, "usr/local/sbin/usd-release-approved")
    trusted_helper = trusted_helper and os.access(release_helper, os.X_OK)
    add("release-helper", trusted_helper, detail if trusted_helper else "missing, untrusted or not executable")
    for relative in ("usr/local/libexec/usd-verify-image-signature", "usr/local/libexec/usd-cosign"):
        trusted, detail = check_private_file(root, relative)
        trusted = trusted and os.access(root / relative, os.X_OK)
        if trusted and relative.endswith("usd-cosign"):
            try:
                with (root / relative).open("rb") as stream:
                    trusted = hashlib.file_digest(stream, "sha256").hexdigest() == COSIGN_SHA256
            except OSError:
                trusted = False
            detail = "pinned checksum verified" if trusted else "checksum mismatch"
        add("signature-tool:" + relative.rsplit("/", 1)[1], trusted,
            detail if trusted else "missing, untrusted or checksum mismatch")

    if live:
        if os.geteuid() != 0:
            add("root-privileges", False, "run with sudo to inspect protected policies and Docker")
        for unit in REQUIRED_UNITS:
            active, _ = run(["systemctl", "is-active", "--quiet", unit])
            enabled, _ = run(["systemctl", "is-enabled", "--quiet", unit])
            add("unit:" + unit, active and enabled, "active+enabled" if active and enabled else "inactive or disabled")
        docker_ok, _ = run(["docker", "info", "--format", "{{.ServerVersion}}"])
        add("docker-daemon", docker_ok, "responding" if docker_ok else "unavailable")
        if tags:
            for service in ("api", "frontend"):
                image = f"ghcr.io/kolyagazha89/usd-2.0-{service}:{tags[0]}"
                ok, revision = run(["docker", "image", "inspect", "--format",
                                    '{{index .Config.Labels "org.opencontainers.image.revision"}}', image])
                add("image:" + service, ok and revision == tags[0],
                    "revision verified" if ok and revision == tags[0] else "missing/mismatched revision")
        disk = shutil.disk_usage(str(root))
        add("disk-free-8GiB", disk.free >= 8 * 1024 ** 3,
            "sufficient" if disk.free >= 8 * 1024 ** 3 else "less than 8 GiB")

    return {"ready": all(item["ok"] for item in checks), "checks": checks}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("/"), help="filesystem root for offline assessment")
    parser.add_argument("--live", action="store_true", help="also check running services and images")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv)
    if args.live and args.root.resolve() != Path("/"):
        parser.error("--live only supports the real host root")
    result = assess(args.root, args.live)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for item in result["checks"]:
            print(f'{"PASS" if item["ok"] else "BLOCK"} {item["name"]}: {item["detail"]}')
        print("READY" if result["ready"] else "NOT READY — no changes made")
    return 0 if result["ready"] else 1


if __name__ == "__main__":
    sys.exit(main())
