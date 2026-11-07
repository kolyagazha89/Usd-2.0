# Component catalog and requests Implementation Plan

**Goal:** Make catalog management and participant requests usable and support a safe brand merge.

**Architecture:** Keep archival catalog CRUD; separate queue controls from catalog. Implement merge only on the server with a preview revision and atomic write/audit, coordinating existing writers to avoid lost updates.

**Tech Stack:** React, NestJS, Prisma, PostgreSQL.

**Spec:** docs/superpowers/specs/2026-11-07-components-design.md

## Tasks

- [ ] Add failing tests for queue tabs, filters, errors and retry; implement and verify.
- [ ] Add failing merge tests for scope, collisions, IDs, archival, validation, stale revision, concurrency and RBAC; implement transactional endpoint and audit.
- [ ] Add merge preview and confirmation UI and test save, cancellation and failures.
- [ ] Run full suites and builds, browser fixtures at 320/390/1440, inspect diff and report.
