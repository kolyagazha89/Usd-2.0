# USD LAN — Season acceptance: one Docker project, one accumulating PostgreSQL

**Owner decision (2026-11-15):** do not create an independent Docker Compose project, PostgreSQL database, or per-stage volume for each new contest. The Windows laptop hosts **one** venue application and **one** persistent PostgreSQL database. It accumulates real competition stages throughout the season. Historical records stay queryable.

This decision supersedes the per-stage Docker-project approach in PR #559. That implementation is already in main, but is **not** accepted as the final LAN season workflow. A migration must preserve any real existing stage volumes; do not run `docker compose down -v` or silently create a second project.

## Required behavior

1. **Install first stage:** retain signed JSON, approved staff access and server trust fingerprint; import into existing `usd_venue` DB. Keep one fixed Compose project, pinned to current stage for judging.
2. **Import stage B:** verify the signed package and current stage's exact central ACK first. Atomically add B's stage, registrations, numbers, inspections, class mappings and baseline results to the *same* database. Reuse stable participant/car/season/class IDs without changing historical results or replacing an existing record. Detect conflicts before applying anything; fail closed with a repair message.
3. **One active stage:** root-owned control identifies current stage. API writes and LIVE operate only on that stage; history remains readable. Never allow writes to historical stage results through stale links, scripts or a mismatched frontend.
4. **Per-stage immutable journal:** baseline import operations are *not* return events. Every local modification carries a validated stage ID, and its hash chain is scoped to that stage. Export/sync for B must never contain A events, even with noncontiguous global sequence numbers and reused participant/car IDs.
5. **Idempotency:** reinstalling a previously imported stage cannot duplicate or reset it. Failed imports are transactional. Retries after interruption either complete or leave the old stage operational.
6. **Staff identities:** reuse established ADMIN and JUDGE accounts with least privilege. Re-import of approved access must not duplicate accounts, silently escalate permission or replace password verifiers without authorization.
7. **ACK safety:** switching is refused until the current stage's exact journal tip is acknowledged by Ubuntu, including derived rankings, or a fresh upload is accepted. Expiry, conflict, network loss and hash mismatch preserve the old stage's state and allow a safe retry.
8. **Backup:** keeping older records in the same database is **historical retention, not an independent backup**. Make verified encrypted off-device PostgreSQL backup before schema/season migration and before the competition; include media only if actually used.
9. **Operator UX:** administrator sees one `USD — Следующий этап` action, list of installed stages, active stage marker, last ACK status, and no Docker jargon. Ordinary online/offline/return actions operate on the selected active stage.
10. **Upgrade:** any laptop from the initial single-stage release or the interim per-stage-project release must be migrated nondestructively, with original volumes retained until independent verification. Never assume one current project naming scheme.

## Mandatory tests before enabling in production

- PostgreSQL 18: real signed A → judge registrations/results → signed return → exact Ubuntu ACK → signed B imported into same database → new judge results → B return → A result rows byte-for-byte unchanged; totals and links remain valid.
- Duplicate stage import, shared participant/vehicle, shared configuration version, conflicting source IDs, changed class metadata, failed import after partial creates, interrupted power, offline WAN, expired sync token and tampered package.
- Test that B export cannot contain any A events, regardless of global `sequence` or participant/car ID sharing; check both root-owned journal and central sync endpoint.
- Test Windows 10/11 PowerShell 5.1 one-click wizard, local HTTPS / two phones without WAN, autostart after reboot, restore after failure and Ubuntu real-world verification.

**Release rule:** the draft PR for this architecture is not merged until end-to-end two-stage and migration acceptance pass. The stage-scoped return-collector test alone is not proof of multi-stage readiness.
