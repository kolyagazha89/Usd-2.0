#!/usr/bin/env python3
"""Fail-closed, additive-only Prisma migration gate for USD home auto releases.

Invoked by the root-owned builder with its exclusive inherited lock. --check
never mutates the DB. --apply requires the fresh release-approved.sh preflight
receipt (including full restored-backup rehearsal), then upgrades the SAME live
DB and atomically advances the root-owned schema pin. It never resets/resolves
Prisma history, restarts PostgreSQL or claims a DB downgrade on image rollback.

Only CREATE TABLE / indexes on newly created tables / their foreign keys and
nullable ADD COLUMN on existing tables are accepted. Any more complex migration
needs an explicitly supervised release.
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
POLICY = STATE / "schema-pin"
# ProtectSystem=full mounts /etc read-only. Copy the original operator
# approval once, then atomically advance only the root-owned StateDirectory.
RECEIPT = STATE / "initial-preflight"
LOCK = "/run/lock/usd-home-deploy.lock"
SHA = re.compile(r"^[0-9a-f]{40}$")
MIGRATION = re.compile(r"^backend/prisma/migrations/([0-9]{14}_[a-z0-9_]+)/migration\.sql$")
IDENT = r'"[A-Za-z_][A-Za-z0-9_]*"'
NAMES = rf"{IDENT}(?:\s*,\s*{IDENT})*"
TYPE = r"(?:TEXT|VARCHAR\([1-9][0-9]{0,4}\)|INTEGER|BIGINT|SMALLINT|BOOLEAN|TIMESTAMPTZ(?:\([0-6]\))?|TIMESTAMP(?:\([0-6]\))?|DATE|UUID|JSONB|BYTEA|DOUBLE PRECISION|DECIMAL\([1-9][0-9]?,[0-9]{1,2}\))"
DEFAULT = r"(?:CURRENT_TIMESTAMP|true|false|-?[0-9]+|'[A-Za-z0-9_ -]{0,120}')"


def run(*args: str) -> str:
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError as exc:
        raise ValueError("Trusted command failed: " + args[0]) from exc


def private(path: Path, *, directory: bool = False) -> None:
    st = path.lstat()
    if path.is_symlink() or st.st_uid != 0 or st.st_mode & 0o077:
        raise ValueError("Unsafe root-only migration state")
    if (directory and not stat.S_ISDIR(st.st_mode)) or (
        not directory and not stat.S_ISREG(st.st_mode)
    ):
        raise ValueError("Unexpected migration state type")


def locked() -> None:
    if os.environ.get("USD_DEPLOY_LOCK_HELD") != "1":
        raise ValueError("Auto migration requires inherited exclusive lock")
    if os.readlink("/proc/self/fd/9") != LOCK:
        raise ValueError("Auto migration requires trusted deployment lock")
    fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)


def split_items(body: str) -> list[str]:
    """Split comma-delimited column definitions, honoring type parentheses."""
    result, depth, quote, start = [], 0, "", 0
    for i, ch in enumerate(body):
        if ch == "'" and quote != '"':
            quote = "" if quote == "'" else "'"
        elif ch == '"' and quote != "'":
            quote = "" if quote == '"' else '"'
        elif not quote:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth < 0:
                    raise ValueError("Unbalanced table definition")
            elif ch == "," and depth == 0:
                result.append(body[start:i].strip())
                start = i + 1
    if depth or quote:
        raise ValueError("Unbalanced table definition")
    result.append(body[start:].strip())
    return result


def check_additive_sql(sql: str) -> None:
    if len(sql) > 100_000 or "\x00" in sql or "/*" in sql or "*/" in sql or "$" in sql:
        raise ValueError("Nonstandard SQL cannot be auto migrated")
    sql = re.sub(r"--[^\n]*", "", sql)
    statements = [x.strip() for x in sql.split(";") if x.strip()]
    if not statements or len(statements) > 150:
        raise ValueError("Missing or excessively large SQL migration")
    created: set[str] = set()
    # First pass identifies new tables. A forward reference to a new table
    # is allowed, but adding an index/FK to an existing table is not.
    for statement in statements:
        m = re.fullmatch(rf"CREATE TABLE ({IDENT})\s*\((.*)\)", statement, re.S | re.I)
        if m:
            if m.group(1) in created:
                raise ValueError("Duplicate CREATE TABLE")
            created.add(m.group(1))
            items = split_items(m.group(2))
            if not items:
                raise ValueError("Empty table")
            for item in items:
                column = re.fullmatch(
                    rf"{IDENT}\s+{TYPE}(?:\s+NOT NULL)?(?:\s+DEFAULT\s+{DEFAULT})?",
                    item, re.I
                )
                primary = re.fullmatch(
                    rf"CONSTRAINT\s+{IDENT}\s+PRIMARY KEY\s*\(\s*{NAMES}\s*\)",
                    item, re.I
                )
                if not (column or primary):
                    raise ValueError("Unsafe CREATE TABLE definition")
    approved = 0
    for statement in statements:
        m = re.fullmatch(rf"CREATE TABLE ({IDENT})\s*\((.*)\)", statement, re.S | re.I)
        if m:
            approved += 1
            continue
        m = re.fullmatch(
            rf"CREATE\s+(?:UNIQUE\s+)?INDEX\s+{IDENT}\s+ON\s+({IDENT})\s*\(\s*{NAMES}\s*\)",
            statement, re.I
        )
        if m and m.group(1) in created:
            approved += 1
            continue
        m = re.fullmatch(
            rf"ALTER TABLE\s+({IDENT})\s+ADD CONSTRAINT\s+{IDENT}\s+"
            rf"FOREIGN KEY\s*\(\s*{NAMES}\s*\)\s+REFERENCES\s+{IDENT}"
            rf"\s*\(\s*{NAMES}\s*\)\s+ON DELETE\s+(?:CASCADE|RESTRICT|SET NULL|NO ACTION)"
            rf"\s+ON UPDATE\s+(?:CASCADE|RESTRICT|SET NULL|NO ACTION)",
            statement, re.I
        )
        if m and m.group(1) in created:
            approved += 1
            continue
        m = re.fullmatch(
            rf"ALTER TABLE\s+({IDENT})\s+ADD COLUMN\s+{IDENT}\s+{TYPE}(?:\s+NULL)?",
            statement, re.I
        )
        # Nullable new columns only, never NOT NULL/DEFAULT/rewrite existing rows.
        if m and m.group(1) not in created:
            approved += 1
            continue
        raise ValueError("Unsafe or unsupported SQL statement in automatic migration")
    if approved != len(statements):
        raise ValueError("SQL migration validation incomplete")


def container(service: str) -> str:
    ids = run("docker", "ps", "-q", "--filter", "label=com.docker.compose.project=usd-home",
              "--filter", "label=com.docker.compose.service=" + service).splitlines()
    if len(ids) != 1:
        raise ValueError("Expected exactly one production " + service)
    return ids[0]


def query(db: str, sql: str) -> str:
    return run("docker", "exec", db, "sh", "-c",
               'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "$1"',
               "usd-auto-schema-read-only", sql)


def history(db: str) -> list[dict]:
    return json.loads(query(db, """SELECT coalesce(json_agg(json_build_object(
        'name', migration_name, 'sha', checksum,
        'finished', finished_at IS NOT NULL, 'rolled_back', rolled_back_at IS NOT NULL)), '[]')
        FROM "_prisma_migrations" """))


def row_counts(db: str) -> dict[str, int]:
    statement = query(db, """SELECT string_agg(format(
        'SELECT %L AS table_name, count(*) AS row_count FROM %I.%I',
        tablename, schemaname, tablename), ' UNION ALL ')
        FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'""")
    if not statement:
        raise ValueError("No application tables in production")
    return {name: int(count) for name, count in
            (line.rsplit("|", 1) for line in query(db, statement).splitlines())}


def migration_state(old: str, new: str, db: str) -> tuple[list[str], dict[str, str]]:
    statuses = run("git", "-C", str(SOURCE), "diff", "--name-status", old, new,
                   "--", "backend/prisma").splitlines()
    added = []
    for line in statuses:
        parts = line.split("\t")
        if len(parts) != 2:
            raise ValueError("Prisma changes include renames or unsupported operations")
        change, path = parts
        if change == "M" and path == "backend/prisma/schema.prisma":
            continue
        match = MIGRATION.fullmatch(path)
        if change != "A" or not match:
            raise ValueError("Existing migration or unapproved Prisma file changed")
        added.append(match.group(1))
    if not added or len(added) > 3 or len(set(added)) != len(added):
        raise ValueError("Auto upgrade requires 1-3 new migration files")
    before_paths = run("git", "-C", str(SOURCE), "ls-tree", "-r", "--name-only",
                       old, "--", "backend/prisma/migrations").splitlines()
    old_names = {m.group(1) for p in before_paths if (m := MIGRATION.fullmatch(p))}
    if old_names and min(added) <= max(old_names):
        raise ValueError("New migration names must follow existing history")
    after_paths = run("git", "-C", str(SOURCE), "ls-tree", "-r", "--name-only",
                      new, "--", "backend/prisma/migrations").splitlines()
    expected = {}
    for path in after_paths:
        match = MIGRATION.fullmatch(path)
        if not match:
            continue
        body = subprocess.check_output(["git", "-C", str(SOURCE), "show", new + ":" + path],
                                       stderr=subprocess.DEVNULL)
        expected[match.group(1)] = hashlib.sha256(body).hexdigest()
        if match.group(1) in added:
            check_additive_sql(body.decode("utf-8"))
    if not old_names or len(expected) != len(old_names) + len(added):
        raise ValueError("Candidate migration set is not an additive continuation")
    applied = set()
    for row in history(db):
        if row.get("rolled_back") is True:
            continue
        name = row.get("name")
        if not row.get("finished") or name not in expected or name in applied:
            raise ValueError("Unknown, duplicate or unfinished live Prisma migration")
        if row.get("sha") != expected[name]:
            raise ValueError("Live migration checksum mismatch")
        applied.add(name)
    if not old_names.issubset(applied) or not (set(expected) - applied).issubset(set(added)):
        raise ValueError("Live migration history does not match deployed source")
    return sorted(set(expected) - applied), expected


def run_migration(image: str, api: str, runtime_url: str) -> None:
    name = "usd-safe-migrate-" + uuid.uuid4().hex
    fd, path = tempfile.mkstemp(prefix="safe-migration-env.", dir=STATE)
    try:
        with os.fdopen(fd, "w") as f:
            f.write("DATABASE_URL=" + runtime_url + "\n")
        with (STATE / "safe-migration.log").open("w") as output:
            os.chmod(STATE / "safe-migration.log", 0o600)
            subprocess.run([
                "docker", "create", "--name", name, "--memory=512m", "--memory-swap=512m",
                "--label", "usd.safe-migration=true", "--network", "container:" + api,
                "--env-file", path, "--entrypoint", "timeout", image,
                "540s", "/app/node_modules/.bin/prisma", "migrate", "deploy",
            ], check=True, stdout=subprocess.DEVNULL, stderr=output, timeout=30)
            result = subprocess.run(["docker", "start", "--attach", name],
                                    stdout=output, stderr=subprocess.STDOUT, timeout=600)
            if result.returncode:
                raise ValueError("Live additive migration failed; see private safe-migration.log")
    finally:
        previous = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
        for sig in previous:
            signal.signal(sig, signal.SIG_IGN)
        try:
            removed = subprocess.run(["docker", "rm", "-f", name],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
            if removed.returncode:
                raise ValueError("CRITICAL: migration container cleanup failed")
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)
            Path(path).unlink(missing_ok=True)


def promote_schema(tree: str) -> None:
    private(POLICY)
    fd, path = tempfile.mkstemp(prefix=".usd-auto-schema.", dir=POLICY.parent)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(tree + "\n")
            f.flush()
            os.fsync(f.fileno())
        os.chmod(path, 0o600)
        os.replace(path, POLICY)
    finally:
        Path(path).unlink(missing_ok=True)


def apply_or_reconcile(
    old: str, new: str, api: str, db: str, image_id: str, runtime_url: str,
    original: dict[str, int], new_tree: str, pending: list[str],
) -> None:
    """Complete a previously applied migration without rerunning its SQL.

    A container can finish Prisma migrate deploy successfully while a later
    verification, cleanup or policy-write step fails. The root deployer will
    quarantine that release; a NEW, CI-verified main release may resume only
    after an independent fresh backup/restore receipt and exact live-history
    verification. No migrate resolve/reset and no blind pin updates.
    """
    if pending:
        print("Live migration required; Prisma will apply: " + ", ".join(pending), flush=True)
        try:
            run_migration(image_id, api, runtime_url)
        except (OSError, subprocess.SubprocessError) as exc:
            raise ValueError(
                "Prisma execution or migration-container cleanup failed; "
                "inspect read-only live migration history before retrying"
            ) from exc
    else:
        print(
            "All candidate Prisma migrations already recorded on live DB; "
            "verify integrity and reconcile the schema pin without replaying SQL",
            flush=True,
        )
    try:
        pending_after, _ = migration_state(old, new, db)
    except (OSError, subprocess.SubprocessError) as exc:
        raise ValueError("Post-migration Prisma checksum/history verification failed") from exc
    if pending_after:
        raise ValueError("Migration history still contains pending migrations")
    print("Post-migration checksums and live history verified", flush=True)
    try:
        unchanged_db = container("db") == db
        healthy = run("docker", "inspect", "-f", "{{.State.Health.Status}}", db) == "healthy"
    except (OSError, subprocess.SubprocessError) as exc:
        raise ValueError("Post-migration PostgreSQL container/health query failed") from exc
    if not unchanged_db or not healthy:
        raise ValueError("Production DB changed or became unhealthy")
    try:
        current = row_counts(db)
    except (OSError, subprocess.SubprocessError) as exc:
        raise ValueError("Post-migration PostgreSQL row-count query failed") from exc
    if any(table not in current or current[table] < count for table, count in original.items()):
        raise ValueError("Live migration removed a table or reduced stored rows")
    print("Post-migration PostgreSQL health and existing row counts verified", flush=True)
    try:
        promote_schema(new_tree)
    except (OSError, subprocess.SubprocessError) as exc:
        raise ValueError("Verified live schema, but atomic schema-policy promotion failed") from exc
    # A stale receipt cannot authorize another SQL execution. The schema pin
    # is already promoted; if unlink fails, report the precise post-pin phase.
    try:
        RECEIPT.unlink()
    except OSError as exc:
        raise ValueError("Live schema policy promoted, but preflight receipt cleanup failed") from exc
    print("Additive live schema and root-owned schema pin reconciled; DB preserved", flush=True)


def main(argv: list[str]) -> int:
    if (len(argv) != 5 or argv[1] not in ("--check", "--apply") or
            not all(SHA.fullmatch(value) for value in argv[2:])):
        raise ValueError("Usage: safe-schema-migration.py <--check|--apply> NEW_SHA OLD_SHA APPROVED_TREE")
    if os.geteuid() != 0:
        raise ValueError("Automatic schema checks require root")
    mode, new, old, approved = argv[1:]
    locked()
    private(STATE, directory=True)
    private(POLICY)
    if POLICY.read_text().strip() != approved:
        raise ValueError("Approved schema policy changed during release")
    source_st = SOURCE.lstat()
    if SOURCE.is_symlink() or source_st.st_uid != 0 or source_st.st_mode & 0o022:
        raise ValueError("Untrusted release source")
    old_tree = run("git", "-C", str(SOURCE), "rev-parse", old + ":backend/prisma")
    new_tree = run("git", "-C", str(SOURCE), "rev-parse", new + ":backend/prisma")
    if old_tree != approved or new_tree == approved:
        raise ValueError("Unapproved schema source transition")
    api, db = container("api"), container("db")
    if run("docker", "inspect", "-f", "{{.Config.Image}}", api) != "ghcr.io/kolyagazha89/usd-2.0-api:" + old:
        raise ValueError("Live API is not the verified previous release")
    pending, expected = migration_state(old, new, db)
    print("Additive-only migration review passed; pending: " + (", ".join(pending) or "none"))
    if mode == "--check":
        return 0
    # Every pre-apply refusal must identify its phase without exposing the
    # connection URL, Docker environment, filesystem details or credentials.
    try:
        private(RECEIPT)
    except OSError as exc:
        raise ValueError("Preflight receipt unavailable: " + type(exc).__name__) from exc
    try:
        valid_receipt = (
            time.time() - RECEIPT.stat().st_mtime <= 7200
            and RECEIPT.read_text().splitlines() == [new, old, db]
        )
    except OSError as exc:
        raise ValueError("Preflight receipt unreadable: " + type(exc).__name__) from exc
    if not valid_receipt:
        raise ValueError("Fresh full-backup restore receipt does not match live DB")
    image_tag = "ghcr.io/kolyagazha89/usd-2.0-api:" + new
    try:
        image_revision = run("docker", "image", "inspect", "--format",
                             '{{index .Config.Labels "org.opencontainers.image.revision"}}', image_tag)
        image_id = run("docker", "image", "inspect", "--format", "{{.Id}}", image_tag)
    except OSError as exc:
        raise ValueError("Candidate image inspect unavailable: " + type(exc).__name__) from exc
    if image_revision != new or not re.fullmatch(r"sha256:[a-f0-9]{64}", image_id):
        raise ValueError("Migration image does not match approved source")
    try:
        runtime_raw = run("docker", "inspect", "-f", "{{json .Config.Env}}", api)
        runtime = json.loads(runtime_raw)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Live API environment metadata unreadable: " + type(exc).__name__) from exc
    if not isinstance(runtime, list) or any(not isinstance(v, str) for v in runtime):
        raise ValueError("Unexpected live API environment metadata")
    urls = [x[len("DATABASE_URL="):] for x in runtime if x.startswith("DATABASE_URL=")]
    if len(urls) != 1 or "\n" in urls[0] or "\r" in urls[0]:
        raise ValueError("Unsafe runtime database environment")
    try:
        parsed = urlsplit(urls[0])
    except ValueError as exc:
        raise ValueError("Invalid runtime database address") from exc
    if parsed.scheme not in ("postgres", "postgresql") or parsed.hostname != "db" or parsed.port != 5432:
        raise ValueError("Live migration must target local PostgreSQL")
    try:
        original = row_counts(db)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Production pre-migration row-count query failed: " + type(exc).__name__) from exc
    apply_or_reconcile(old, new, api, db, image_id, urls[0], original, new_tree, pending)
    return 0


if __name__ == "__main__":
    try:
        def interrupt(*_args):
            raise InterruptedError("Automatic schema migration interrupted")
        signal.signal(signal.SIGTERM, interrupt)
        sys.exit(main(sys.argv))
    except (ValueError, OSError, subprocess.SubprocessError, UnicodeDecodeError,
            json.JSONDecodeError, InterruptedError) as exc:
        # Never print database URLs or Docker environment values.
        # Root-only journal: a type/errno identifies the failure class
        # without leaking secrets, database rows, paths or Docker env.
        if isinstance(exc, ValueError):
            message = str(exc)
        elif isinstance(exc, OSError):
            message = "Automatic schema migration OS failure: " + type(exc).__name__ + (
                " (errno " + str(exc.errno) + ")" if exc.errno is not None else "")
        else:
            message = "Automatic schema migration failed: " + type(exc).__name__
        print(message, file=sys.stderr)
        sys.exit(1)
