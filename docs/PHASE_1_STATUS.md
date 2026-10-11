# USD 2.0 — Phase 1 delivery checklist

This is the working acceptance checklist for P0. A code commit is not considered complete until the relevant build, tests, authorization checks, and end-to-end workflow have passed. The checklist must be updated with evidence rather than optimistic estimates.

## Status key

- `DONE — CODE`: implementation is present but may still need verification.
- `BLOCKED — VALIDATION`: code exists; validation is blocked and the feature is not cleared for release.
- `TODO`: not implemented yet.

## P0 checklist

| Area | Status | Evidence / remaining work |
|---|---|---|
| Repository architecture and product constraints | DONE — CODE | [PRODUCT_ARCHITECTURE.md](./PRODUCT_ARCHITECTURE.md), [OFFLINE_MODE.md](./OFFLINE_MODE.md) |
| Public stage visibility | DONE — CODE | Added `GET /stages/public`, restricted to non-deleted PUBLISHED/COMPLETED stages; keep admin's existing stage list intact |
| Public website shell | DONE — CODE | Responsive public home, stages, results, records and rules routes in the React app; requires UI/data QA and CMS integration |
| Participant cabinet registration list | DONE — CODE | Cabinet loads the participant's registrations and shows stage/car/class information |
| QR credential storage | DONE — CODE | Random opaque token, SHA-256 hash stored in PostgreSQL, issue/resolve/revoke endpoints, audit events and migration |
| Judge QR scanner and direct inspection opening | DONE — CODE | Camera scanner where BarcodeDetector is supported, manual token/link fallback, registration card and direct opening of the matching inspection modal |
| Participant QR display | DONE — CODE | QR rendered locally in the participant cabinet; token is not sent to a third-party QR image service |
| QR security and ownership boundaries | BLOCKED — VALIDATION | Unit tests added; must run tests and verify authenticated role/ownership behavior against a real test database |
| Existing auth and ADMIN/JUDGE semantics | TODO — VERIFY | Run a permission regression matrix for admin, judge and participant across all routes; don't infer correctness from UI visibility |
| Custom role editor (RBAC) | TODO | Data model, effective-permission resolver, admin UI, audit, last-admin protection and migration are not yet implemented |
| Core CMS (homepage blocks, navigation, news, rules, SEO, preview/versioning) | TODO | Public pages currently use a starter shell and settings fallback; full content management and publishing workflow are not implemented |
| Registration completion flow | TODO | Public stage CTA exists; full self-service stage/car/config/class selection, legal review, confirmation, edit/cancel and email flow need completion |
| Legal document versioning and consent evidence | TODO | Separate consent purposes, immutable versions, revocation and retention workflows need implementation and legal review |
| Transactional email and marketing mail separation | TODO | Delivery queue, templates, retries, unsubscribe/consent enforcement and delivery logs need implementation/verification |
| Offline event operation | TODO — ARCHITECTURE ONLY | Architecture is documented; local hub, IndexedDB package/queue, synchronization API, idempotency and conflict UI are not implemented |
| Backups, restore drill, monitoring and alerting | TODO — VERIFY | Documented operational requirement; verify actual schedules, recovery procedure and alert delivery |
| CI build/lint/unit/e2e | BLOCKED — VALIDATION | GitHub jobs fail before any steps start (runner ID 0, empty steps, no logs). This is not evidence of a source compile failure; runner/account configuration must be restored, then all checks rerun |
| Production database migration and deploy | NOT RUN | Intentionally not run from this feature branch. Do not deploy until validation and rollout review pass |

## Required release gate

1. Restore a working CI runner and capture successful backend build, lint, unit and e2e checks, plus frontend typecheck/build.
2. Validate Prisma schema/migration on a disposable PostgreSQL database and verify generated client compatibility.
3. Run QR issue/scan/revoke tests for ADMIN, JUDGE, participant owner, participant non-owner, cancelled registration, deleted/cancelled stage, invalid token, and already-inspected registration.
4. Verify that public endpoints never return draft/unpublished stages or unapproved results.
5. Test public pages and participant cabinet on narrow mobile screens and current iOS/Android browsers; verify camera permission and manual fallback.
6. Complete the TODO P0 items above before calling Phase 1 complete.
7. Review backup/restore, privacy/legal handling and deployment plan. Production migration/deploy requires an explicit, reviewed release decision.

## Current truth

The QR foundation and public-site starter are code-complete enough for validation, but **Phase 1 is not complete and is not release-ready**. Offline synchronization, full CMS, configurable RBAC, legal/consent lifecycle, complete registration, email delivery, and release validation remain open.
