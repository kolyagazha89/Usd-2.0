#!/usr/bin/env python3
"""Read-only USD Prisma history diagnostic; prints no participant data or credentials.

Usage (on Ubuntu, in SSH): sudo python3 diagnose-live-prisma-history.py
This script deliberately NEVER invokes prisma migrate resolve/reset/deploy.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

SOURCE = Path("/opt/usd-release-source")
ROOT = SOURCE / "backend/prisma/migrations"
REVIEWED = {
    "20261028150000_participant_usd_id",
    "20261028172000_configuration_catalog_entry_ids",
}
DB_QUERY = """SELECT COALESCE(json_agg(json_build_object(
    'migration_name', migration_name,
    'checksum', checksum,
    'finished', finished_at IS NOT NULL,
    'rolled_back', rolled_back_at IS NOT NULL)
    ORDER BY started_at), '[]'::json)
    FROM "_prisma_migrations" """


def classify(history, expected):
    active = {}
    unknown = []
    failed = []
    mismatched = []
    duplicates = []
    rolled_back = []
    for row in history:
        name = row["migration_name"]
        if row["rolled_back"]:
            rolled_back.append(name)
            continue
        if name not in expected:
            unknown.append(name)
        if not row["finished"]:
            failed.append(name)
        if name in active:
            duplicates.append(name)
        active[name] = row
        if name in expected and row["checksum"] != expected[name]:
            mismatched.append(name)
    missing = sorted(set(expected) - set(active))
    old_missing = [name for name in missing if name not in REVIEWED]
    new_missing = [name for name in missing if name in REVIEWED]
    return {
        "unknown": sorted(set(unknown)),
        "unfinished": sorted(set(failed)),
        "duplicates": sorted(set(duplicates)),
        "checksum_mismatch": sorted(set(mismatched)),
        "rolled_back_attempts": sorted(set(rolled_back)),
        "missing_preexisting": old_missing,
        "reviewed_pending": new_missing,
        "applied": len(active),
        "expected": len(expected),
    }


def main():
    if os.geteuid() != 0:
        raise ValueError("Run as root via sudo")
    if not SOURCE.is_dir() or SOURCE.is_symlink() or not ROOT.is_dir():
        raise ValueError("Root-owned USD release source is unavailable")
    sha = subprocess.check_output(
        ["git", "-C", str(SOURCE), "rev-parse", "HEAD"],
        text=True, stderr=subprocess.DEVNULL).strip()
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("Invalid release source SHA")
    expected = {p.parent.name: hashlib.sha256(p.read_bytes()).hexdigest()
                for p in ROOT.glob("*/migration.sql")}
    if len(expected) < 40:
        raise ValueError("Expected source migrations missing")
    ids = subprocess.check_output(
        ["docker", "ps", "-q", "--filter", "label=com.docker.compose.project=usd-home",
         "--filter", "label=com.docker.compose.service=db"],
        text=True, stderr=subprocess.DEVNULL).split()
    if len(ids) != 1:
        raise ValueError("Expected exactly one running USD PostgreSQL container")
    # psql inherits username and DB name only within the local DB container.
    # No password, DATABASE_URL or row values are read or printed.
    raw = subprocess.check_output(
        ["docker", "exec", ids[0], "sh", "-c",
         'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "$1"',
         "usd-prisma-readonly", DB_QUERY],
        text=True, stderr=subprocess.DEVNULL)
    history = json.loads(raw)
    if not isinstance(history, list):
        raise ValueError("Unexpected migration history response")
    names = re.compile(r"^[a-zA-Z0-9_-]{1,120}$")
    if any(not isinstance(row, dict) or not isinstance(row.get("migration_name"), str)
           or not names.fullmatch(row["migration_name"]) or
           not isinstance(row.get("checksum"), str) or
           not isinstance(row.get("finished"), bool) or
           not isinstance(row.get("rolled_back"), bool) for row in history):
        raise ValueError("Unexpected migration history entry (names not printed)")
    outcome = classify(history, expected)
    print("USD PRISMA LIVE HISTORY REPORT — READ ONLY")
    print("Candidate source:", sha)
    print("Recorded migration attempts:", len(history))
    print("Active migration names:", outcome["applied"])
    print("Migration files in candidate:", outcome["expected"])
    for key in ("unknown", "unfinished", "duplicates", "checksum_mismatch",
                "missing_preexisting", "reviewed_pending", "rolled_back_attempts"):
        names_for_key = outcome[key]
        print(key + ": " + (", ".join(names_for_key) if names_for_key else "(none)"))
    blocking = any(outcome[key] for key in (
        "unknown", "unfinished", "duplicates", "checksum_mismatch", "missing_preexisting"))
    print("OUTCOME:", "BLOCKED — manual migration review needed" if blocking else
          "History compatible with reviewed nullable additions")
    print("No database changes performed. Do NOT use migrate resolve/reset.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        print("USD live migration diagnosis failed:", str(exc) if isinstance(exc, ValueError)
              else type(exc).__name__, file=sys.stderr)
        sys.exit(1)
