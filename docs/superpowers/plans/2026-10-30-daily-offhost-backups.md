# Daily Off-host Backups Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Native execution is already authorized; do not pause for design questions.

**Goal:** Produce daily, verified PostgreSQL 18 and media backups independently of releases, without changing live application services.

**Architecture:** A root-owned backup-only Python helper holds the existing deployment lock, validates the actual running stack and private backup policies, and calls the existing off-host database, media, and isolated PostgreSQL restore helpers. A separate installer ships a disabled systemd timer; a supervised operator must review off-host independence and enable it.

**Tech Stack:** Python standard library, systemd, Docker, rclone, existing Bash verification helpers.

**Spec:** `docs/USD_MASTER_PLAN.md`, sections 2–3, 12 and 14; tracker #114 P0.

## Global Constraints

- Never access a real host, production database or external service during development; fixtures are synthetic.
- PostgreSQL 18; same `/run/lock/usd-home-deploy.lock` as releases.
- No app switch, live migration, database restart, historical replay or retention deletion.
- A disk/share on the same physical PC is not off-host resilience.
- Existing release/setup/install scripts are owned by the signing task and remain untouched.

## Review Focus

- Wrong running database/image or mutable environment must stop before dumping and invalidate a completed run if drift occurs.
- Missing/private-policy failures, local/alias backup destinations and inherited credential overrides must fail closed without exposing secrets.
- Lock contention, remote outages and interrupted verification must produce no success receipt and remain retryable.
- Concurrent media changes must invalidate the backup pair; stable inventory is not an atomic cross-service snapshot guarantee.
- No installer activation and no automatic remote/local retention deletion; restored private data must be cleaned by the shared helpers.

### Task 1: Backup-only helper and failure tests

**Files:** Create `deploy/home-pc/daily-backup.py` and `deploy/home-pc/test-daily-backup.py`.

- [ ] Write and run failing tests for disabled default, private policies, source/image drift, lock contention, verification failure, unique snapshots, stable media inventory and absence of destructive commands.
- [ ] Implement `main()` with fixed host paths and trusted helper calls. Suppress command output containing private values; persist a receipt only after every verification and final source recheck passes.
- [ ] Run the complete new safety suite and existing deploy Python tests.

### Task 2: Inert installation, timer and operator instructions

**Files:** Create `deploy/home-pc/install-daily-backup.sh`, `usd-daily-backup.service`, `usd-daily-backup.timer`, `DAILY_BACKUPS.md` and `.github/workflows/daily-backup-safety.yml`.

- [ ] Add failing installer/timer assertions: root ownership, same deploy lock, no activation, daily calendar plus retry, private state and bounded runtime.
- [ ] Implement the installer/units and document required reviewed policies, source/endpoint mapping, off-host independence, no-delete retention, receipts, failure recovery and consistency limits.
- [ ] Add isolated CI and, where available, real PostgreSQL 18 restore evidence using synthetic data only.
- [ ] Verify shell syntax, systemd units, Python tests and clean diff; commit completed files only, without pushing.
