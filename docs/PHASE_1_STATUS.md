# USD 2.0 — Phase 1 delivery checklist

This is the acceptance checklist. A code commit is not complete until the relevant build/tests and authorization/end-to-end checks pass. A merge, deploy and production verification are separate states.

## Reconciliation — 2026-10-12

- Before reconciliation, GitHub compare showed the feature branch 33 commits ahead and 9 behind `main`; older notes stating 32/6 were stale.
- Reconciliation is represented by a two-parent integration commit on `feature/qr-checkin-and-platform-foundation`. It preserves the feature tree and carries forward the main versions of `.github/workflows/frontend.yml`, `README.md`, `backend/src/imports/imports.service.spec.ts`, `frontend/package.json` and `frontend/src/api.ts`, plus the canonical status checklist.
- The feature branch is not yet merged into `main`, not confirmed deployed and not release-ready.
- Main Backend CI passed on `64ff5839` (run [38178192756](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38178192756)); main Frontend CI passed on `8ed4078e` (run [38177954332](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38177954332)).
- Feature Frontend CI passed before reconciliation (run [38174414826](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38174414826)); Backend CI on the reconciled candidate is still required.
- The earlier deploy workflow built but skipped Cloudflare publish due to missing credentials (run [38177954189](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38177954189)). No production deployment or migration is claimed.

## P0 acceptance checklist

| Area | State | Evidence / next action |
|---|---|---|
| Branch reconciliation | INTEGRATION CANDIDATE ON FEATURE BRANCH | Run CI on exact candidate, inspect all jobs and compare diff before PR/merge |
| Public home, stages, results, records, rules | CODE PRESENT ON FEATURE BRANCH | Mobile and desktop QA; verify routes, loading/empty/error states and links |
| Public stage visibility | CODE PRESENT — VALIDATION OPEN | Confirm anonymous endpoint only exposes non-deleted PUBLISHED/COMPLETED stages |
| Public results/records visibility | VALIDATION OPEN | Check result approval and privacy; no draft/private data leakage |
| Site settings/assets | PARTIAL | Test missing settings/assets and fallback behavior; full CMS deferred |
| Participant cabinet/self-service registration | DEFERRED FROM PUBLIC V1 | Next block after a separate requirements survey |
| QR issue/scan/revoke and migration | CODE PRESENT — VALIDATION OPEN; OUTSIDE THIS BLOCK | Validate on disposable PostgreSQL; never run production migration without explicit approval |
| ADMIN/JUDGE/participant/anonymous permission matrix | TODO — VERIFY | Server-side role and ownership tests |
| Core CMS, news, navigation, SEO, draft/preview/versioning | TODO | Requirements survey and separate design agreement |
| Legal versioning and consent evidence | TODO | Separate requirements and legal review |
| Transactional email/retries/logs | TODO | Separate implementation and delivery tests |
| Configurable RBAC | TODO | Preserve current ADMIN/JUDGE semantics; audit and last-active-admin protection |
| Offline operation | ARCHITECTURE ONLY | Local hub, queue, sync and conflict UI not implemented |
| Backups/restore/monitoring | NOT VERIFIED | Verify actual configuration and perform documented restore drill |
| Backend CI on reconciled candidate | REQUIRED | Build, lint, unit and E2E must pass on exact SHA |
| Frontend CI on reconciled candidate | REQUIRED | Typecheck and build must pass on exact SHA |
| Production migration/deployment | NOT AUTHORIZED IN THIS BLOCK | Separate release decision after CI, migration rehearsal and privacy QA |

## Public V1 boundaries agreed with owner

- Include public home, stages, results, records and rules pages.
- Do not make participant cabinet/self-service registration acceptance criteria for this release; that is the next block.
- Agree on a new visual design separately before major design/CMS implementation.
- Follow `docs/DEVELOPMENT_STATUS.md` as the canonical handoff and update this checklist with evidence after each block.

## Required release gate

1. Run backend build/lint/unit/E2E and frontend typecheck/build on the exact reconciled candidate.
2. Validate the QR Prisma migration on disposable PostgreSQL, without touching production.
3. Test ADMIN/JUDGE/participant-owner/non-owner/anonymous authorization and public stage/result visibility.
4. Test public pages at narrow mobile widths and desktop, including loading/empty/error states.
5. Only then prepare a PR and explicit release/migration plan; production deployment remains separate.

## Current truth

Public-site starter code exists on the feature branch. It is not merged into `main`, not confirmed deployed and not release-ready. Participant cabinet/registration and QR work are deferred from public V1 acceptance, even where code is already present. Full CMS, legal/email workflows, offline operation, RBAC and operational recovery validation remain open.
