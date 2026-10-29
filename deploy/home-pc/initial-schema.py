#!/usr/bin/env python3
"""One-time upgrade of the two reviewed nullable additions from the e8b5b0f host.

The 20261005130000_site_settings migration is the original historical SQL
from commit 1b07512c550b0a71866ce1ef4c22f6b4373390d4. It is already
applied to the live DB, but must remain in the candidate migration directory
for Prisma history compatibility. Neither this helper nor a new release should
reapply it to the live DB.

Never resets/restores the live DB, edits migration history or changes app images.
An actual fresh backup/restore receipt is mandatory before --apply.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from urllib.parse import urlsplit

SOURCE = Path("/opt/usd-release-source")
STATE = Path("/var/lib/usd-deployer")
BASELINE = "e8b5b0f22780a61e79765b8fd92167e241df82a2"
REVIEWED_TREE = "4d9fa43dafd01e58354c3d22ead2cafe45152044"
REVIEWED_ADDITIONS = {
    "20261028150000_participant_usd_id": "88873ec9c8f94fd76269afd29109f9d26b58485584513c19e70fb6ad4273e9f1",
    "20261028172000_configuration_catalog_entry_ids": "cae9b2ef5bcc936199dc7f0c42a1de78555b676ce0b9b949fd23f44c27dd68c9",
}


def pending_migrations(expected: dict[str, str], history: list[dict]) -> list[str]:
    for name, digest in REVIEWED_ADDITIONS.items():
        if expected.get(name) != digest:
            raise ValueError("Reviewed migration content changed; initial upgrade refused")
    applied = set()
    for row in history:
        if row.get("rolled_back") is True:
            continue
        name = row.get("migration_name")
        if not row.get("finished") or name not in expected or name in applied:
            raise ValueError("Failed, unknown or duplicate migration history; no automatic repair")
        if row.get("checksum") != expected[name]:
            raise ValueError("Applied migration checksum differs from reviewed source")
        applied.add(name)
    pending = sorted(set(expected) - applied)
    if not set(pending).issubset(REVIEWED_ADDITIONS):
        raise ValueError("Unreviewed pending migrations; initial upgrade refused")
    return pending


def command(*args: str) -> str:
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError as exc:
        # Name only the operation, never command output or environment values.
        raise ValueError(f"Initial host metadata command failed: {args[0]} {args[1]} (exit {exc.returncode})") from exc


def container(service: str) -> str:
    ids = command("docker", "ps", "-q", "--filter", "label=com.docker.compose.project=usd-home",
                  "--filter", "label=com.docker.compose.service=" + service).splitlines()
    if len(ids) != 1:
        raise ValueError("Expected exactly one running " + service)
    return ids[0]


def query(db: str, sql: str) -> str:
    return command("docker", "exec", db, "sh", "-c",
                   'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "$1"',
                   "usd-initial-schema-check", sql)


def history(db: str) -> list[dict]:
    return json.loads(query(db, """SELECT coalesce(json_agg(json_build_object(
        'migration_name', migration_name, 'checksum', checksum,
        'finished', finished_at IS NOT NULL, 'rolled_back', rolled_back_at IS NOT NULL)), '[]')
        FROM "_prisma_migrations"
        """))


def row_counts(db: str) -> list[str]:
    sql = query(db, """SELECT string_agg(format(
        'SELECT %L AS table_name, count(*) AS row_count FROM %I.%I',
        tablename, schemaname, tablename), ' UNION ALL ')
        FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'""")
    if not sql:
        raise ValueError("No application tables; refusing an initial database bootstrap")
    return sorted(query(db, sql).splitlines())


def verify_row_counts(before: list[str], after: list[str]) -> None:
    def parse(rows):
        return {name: int(count) for name, count in (row.rsplit("|", 1) for row in rows)}
    previous, current = parse(before), parse(after)
    if any(name not in current or current[name] < count for name, count in previous.items()):
        raise ValueError("Initial upgrade removed an application table or reduced its row count")


def trusted(path: Path, *, directory: bool = False) -> None:
    info = path.lstat()
    if path.is_symlink() or info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError("Initial upgrade requires private root-owned state")
    if (directory and not stat.S_ISDIR(info.st_mode)) or (not directory and not stat.S_ISREG(info.st_mode)):
        raise ValueError("Invalid initial upgrade state type")


def execute_migration(image: str, api: str, env_file: str, output) -> None:
    name = "usd-initial-migrate-" + uuid.uuid4().hex
    try:
        subprocess.run(["docker", "create", "--name", name, "--memory=512m", "--memory-swap=512m",
                        "--label", "usd.initial-migration=true", "--network", "container:" + api,
                        "--env-file", env_file, "--entrypoint", "timeout", image,
                        "540s", "/app/node_modules/.bin/prisma", "migrate", "deploy"],
                       check=True, stdout=subprocess.DEVNULL, stderr=output, timeout=30)
        result = subprocess.run(["docker", "start", "--attach", name], stdout=output,
                                stderr=subprocess.STDOUT, timeout=600)
        if result.returncode:
            raise ValueError("Initial migration failed; old images retained. Inspect the private initial-migration.log; no reset was attempted")
    finally:
        # Keep the deployment lock until the container is gone, including
        # timeout/Ctrl-C/TERM. The in-container timeout also bounds SIGKILL cases.
        previous = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
        for sig in previous:
            signal.signal(sig, signal.SIG_IGN)
        try:
            removed = subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL, timeout=30)
            if removed.returncode:
                remaining = subprocess.run(["docker", "ps", "-aq", "--filter", "name=^/" + name + "$"],
                                           capture_output=True, text=True, timeout=15)
                if remaining.returncode or remaining.stdout.strip():
                    raise ValueError("CRITICAL: live migration container cleanup not verified: " + name)
        except subprocess.SubprocessError as exc:
            raise ValueError("CRITICAL: live migration container cleanup not verified: " + name) from exc
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)


def main(argv: list[str]) -> int:
    if len(argv) != 3 or argv[1] not in ("--check", "--apply") or not re.fullmatch(r"[a-f0-9]{40}", argv[2]):
        raise ValueError("Usage: usd-initial-schema <--check|--apply> <full-candidate-SHA>")
    if os.geteuid() != 0:
        raise ValueError("Initial schema checks require root")
    sha = argv[2]
    trusted(STATE, directory=True)
    if SOURCE.is_symlink() or SOURCE.stat().st_uid != 0 or SOURCE.stat().st_mode & 0o022:
        raise ValueError("Untrusted initial upgrade source")
    if command("git", "-C", str(SOURCE), "rev-parse", "HEAD") != sha:
        raise ValueError("Initial upgrade source is not the exact candidate")
    if command("git", "-C", str(SOURCE), "rev-parse", sha + ":backend/prisma") != REVIEWED_TREE:
        raise ValueError("Candidate schema is outside the two reviewed nullable additions")
    expected = {p.parent.name: hashlib.sha256(p.read_bytes()).hexdigest()
                for p in (SOURCE / "backend/prisma/migrations").glob("*/migration.sql")}
    api, db = container("api"), container("db")
    old_image = command("docker", "inspect", "-f", "{{.Config.Image}}", api)
    pending = pending_migrations(expected, history(db))
    if pending and old_image != "ghcr.io/kolyagazha89/usd-2.0-api:" + BASELINE:
        raise ValueError("Pending initial schema upgrade supports only the verified e8b5b0f deployment")
    print("Reviewed pending migrations: " + (", ".join(pending) or "none"))
    if argv[1] == "--check" or not pending:
        return 0
    if os.environ.get("USD_DEPLOY_LOCK_HELD") != "1" or os.readlink("/proc/self/fd/9") != "/run/lock/usd-home-deploy.lock":
        raise ValueError("Initial migration requires the inherited exclusive deployment lock")
    fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
    receipt = STATE / "initial-preflight"
    trusted(receipt)
    if time.time() - receipt.stat().st_mtime > 7200 or receipt.read_text().splitlines() != [sha, BASELINE, db]:
        raise ValueError("Fresh successful backup/restore receipt for this live DB is required")
    image = "ghcr.io/kolyagazha89/usd-2.0-api:" + sha
    revision = command("docker", "image", "inspect", "--format",
                       '{{index .Config.Labels "org.opencontainers.image.revision"}}', image)
    if revision != sha:
        raise ValueError("Candidate image revision does not match approved source")
    runtime = dict(item.split("=", 1) for item in json.loads(command(
        "docker", "inspect", "-f", "{{json .Config.Env}}", api)) if "=" in item)
    url = runtime.get("DATABASE_URL", "")
    parsed = urlsplit(url)
    if parsed.hostname != "db" or parsed.port != 5432 or "\n" in url or "\r" in url:
        raise ValueError("Initial migration must use the verified local runtime database")
    before = row_counts(db)
    fd, name = tempfile.mkstemp(prefix="initial-db-env.", dir=STATE)
    try:
        with os.fdopen(fd, "w") as env_file:
            env_file.write("DATABASE_URL=" + url + "\n")
        log = STATE / "initial-migration.log"
        if log.exists():
            trusted(log)
        with log.open("w") as output:
            os.chmod(log, 0o600)
            execute_migration(image, api, name, output)
    finally:
        Path(name).unlink(missing_ok=True)
    if pending_migrations(expected, history(db)):
        raise ValueError("Reviewed migrations remain pending after initial upgrade")
    if container("db") != db:
        raise ValueError("Initial upgrade changed DB identity; do not release")
    verify_row_counts(before, row_counts(db))
    receipt.unlink()
    print("Reviewed nullable additions applied; existing application row counts and DB container preserved")
    return 0


if __name__ == "__main__":
    try:
        def terminate(_signum, _frame):
            raise InterruptedError("Initial migration interrupted")
        signal.signal(signal.SIGTERM, terminate)
        sys.exit(main(sys.argv))
    except KeyboardInterrupt:
        print("Initial migration interrupted; no application release attempted", file=sys.stderr)
        sys.exit(130)
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        # Command output can contain credentials; retain it only in the private host log.
        print(str(exc) if isinstance(exc, ValueError) else "Initial schema host check failed; no reset or database replacement attempted", file=sys.stderr)
        sys.exit(1)
