# USD 2.0 — Phase 1 delivery checklist

This is the working acceptance checklist for P0. A code commit is not considered complete until the relevant build, tests, authorization checks, and end-to-end workflow have passed. The checklist must be updated with evidence rather than optimistic estimates.

## Status key

- `DONE — CODE`: implementation is present but may still need verification.
- `BLOCKED — VALIDATION`: code exists; validation is blocked and the feature is not cleared for release.
- `TODO`: not implemented yet.

## Current repository reconciliation — 2026-10-12

Read this section together with [the canonical development status on main](https://github.com/kolyagazha89/Usd-2.0/blob/main/docs/DEVELOPMENT_STATUS.md) before starting work.

- This checklist and the public website/QR implementation are on `feature/qr-checkin-and-platform-foundation` at `cb3070a2`; they are **not merged into main and are not confirmed deployed**.
- GitHub compare reports the feature branch is 32 commits ahead and 6 behind `main`. Reconcile the six main-only commits (recent historical import/record/API URL fixes) before integration. Do not merge blindly; review `frontend/src/App.tsx` and backend/migration overlaps.
- Feature branch Frontend CI passed: [run 38174414826](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38174414826). Backend CI for the feature branch has not been verified in the currently inspected runs.
- On `main`, Backend CI passed at `64ff5839` (build, lint, unit and E2E); Frontend CI passed at `8ed4078e`. The Frontend Deploy workflow built successfully but skipped the Cloudflare Worker publish step, so this is **not evidence of a new frontend deployment**.
- The operator confirmed on 2026-10-12 that production admin login works and existing data is present. Preserve that working state; do not use production as a test database.

## P0 checklist

| Area | Status | Evidence / remaining work |
|---|---|---|
| Repository architecture and product constraints | DONE — CODE | [PRODUCT_ARCHITECTURE.md](./PRODUCT_ARCHITECTURE.md), [OFFLINE_MODE.md](./OFFLINE_MODE.md) |
| Public stage visibility | DONE — CODE ON FEATURE BRANCH ONLY | `GET /stages/public` restricts visibility to non-deleted PUBLISHED/COMPLETED stages; verify no result/record privacy leaks and keep admin's full stage list intact |
| Public website shell | DONE — CODE ON FEATURE BRANCH ONLY | Responsive public home, stages, results, records and rules routes exist on this branch; not in main and not confirmed live. Requires UI/data/privacy QA and CMS integration |
| Participant cabinet registration list | DONE — CODE | Cabinet loads the participant's registrations and shows stage/car/class information |
| QR credential storage | DONE — CODE | Random opaque token, SHA-256 hash stored in PostgreSQL, issue/resolve/revoke endpoints, audit events and migration |
| Judge QR scanner and direct inspection opening | DONE — CODE | Camera scanner where BarcodeDetector is supported, manual token/link fallback, registration card and direct opening of the matching inspection modal |
| Participant QR display | DONE — CODE | QR rendered locally in the participant cabinet; token is not sent to a third-party QR image service |
| QR security and ownership boundaries | BLOCKED — VALIDATION | Tests/code exist on feature branch; feature-branch Backend CI is not yet verified. Validate role/ownership behavior, migration and end-to-end flows on disposable PostgreSQL |
| Existing auth and ADMIN/JUDGE semantics | TODO — VERIFY | Run a permission regression matrix for admin, judge and participant across all routes; don't infer correctness from UI visibility |
| Custom role editor (RBAC) | TODO | Data model, effective-permission resolver, admin UI, audit, last-admin protection and migration are not yet implemented |
| Core CMS (homepage blocks, navigation, news, rules, SEO, preview/versioning) | TODO | Public pages currently use a starter shell and settings fallback; full content management and publishing workflow are not implemented |
| Registration completion flow | TODO | Public stage CTA exists; full self-service stage/car/config/class selection, legal review, confirmation, edit/cancel and email flow need completion |
| Legal document versioning and consent evidence | TODO | Separate consent purposes, immutable versions, revocation and retention workflows need implementation and legal review |
| Transactional email and marketing mail separation | TODO | Delivery queue, templates, retries, unsubscribe/consent enforcement and delivery logs need implementation/verification |
| Offline event operation | TODO — ARCHITECTURE ONLY | Architecture is documented; local hub, IndexedDB package/queue, synchronization API, idempotency and conflict UI are not implemented |
| Backups, restore drill, monitoring and alerting | TODO — VERIFY | Documented operational requirement; verify actual schedules, recovery procedure and alert delivery |
| CI build/lint/unit/e2e | MAIN GREEN; FEATURE BACKEND UNVERIFIED | Main Backend CI passed on `64ff5839` (run [38178192756](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38178192756)); main Frontend CI passed on `8ed4078e` (run [38177954332](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38177954332)); feature Frontend CI passed (run [38174414826](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38174414826)). Still required: run backend build/lint/unit/E2E on the feature branch or after branch reconciliation. Older startup failures are historical, not the current status |
| Production database migration and deploy | NOT RUN | Intentionally not run from this feature branch. Do not deploy until validation and rollout review pass |

## Required release gate

1. Reconcile the feature branch with the six main-only commits, then capture successful backend build/lint/unit/E2E and frontend typecheck/build on the exact candidate commit.
2. Validate Prisma schema/migration on a disposable PostgreSQL database and verify generated client compatibility.
3. Run QR issue/scan/revoke tests for ADMIN, JUDGE, participant owner, participant non-owner, cancelled registration, deleted/cancelled stage, invalid token, and already-inspected registration.
4. Verify that public endpoints never return draft/unpublished stages or unapproved results.
5. Test public pages and participant cabinet on narrow mobile screens and current iOS/Android browsers; verify camera permission and manual fallback.
6. Complete the TODO P0 items above before calling Phase 1 complete.
7. Review backup/restore, privacy/legal handling and deployment plan. Production migration/deploy requires an explicit, reviewed release decision.

## Current truth

The QR foundation and public-site starter exist on this feature branch, but are **not merged into main, not confirmed deployed, and not release-ready**. Main CI is green; feature-branch Backend CI still needs verification. Offline synchronization, full CMS, configurable RBAC, legal/consent lifecycle, complete registration, email delivery, privacy/authorization QA, branch reconciliation and release validation remain open.
