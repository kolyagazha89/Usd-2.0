# USD 2.0 — Phase 1 delivery checklist

This is the acceptance checklist. A code commit is not complete until relevant build/tests and authorization/end-to-end checks pass. Merge, deploy and production verification are separate states.

## Reconciliation — 2026-10-12

- Repo: `kolyagazha89/Usd-2.0`; current `main` before release: `71b697c0b1f668aa6bdd054f1f2f1969c8b17329`.
- Public V1 is implemented on `feature/qr-checkin-and-platform-foundation`, PR [#1](https://github.com/kolyagazha89/Usd-2.0/pull/1).
- Cleaned-up candidate before checklist-only updates: `45ddab1dbd2a048d8e2ac4537a6f1044206f04d2`. QR UI/API/schema/migration have been removed from this release candidate to keep the block scoped to public pages.
- Earlier candidate `dd455e1` passed frontend [run 38181056830](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38181056830) and backend [run 38181056848](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38181056848). CI is rerunning on the cleaned-up head; earlier runs do not certify the latest cleanup.
- Cloudflare Worker Build passed on current `main` before this release, but failed on the feature-branch commits. The public-site code is not yet confirmed deployed. GitHub's separate deploy workflow has previously skipped publishing because Cloudflare secrets were missing.
- No production migration has been run. PR #1 remains unmerged pending final validation.

## P0 acceptance checklist

| Area | State | Evidence / next action |
|---|---|---|
| Branch reconciliation | COMPLETE ON FEATURE BRANCH | Review PR #1 diff; keep `main` unchanged until candidate CI passes |
| Public home, stages, results, records, rules | IMPLEMENTED; FINAL CI PENDING | Final build/typecheck, then verify live direct links after release |
| Direct route fallback | CONFIGURED; LIVE CHECK OPEN | `frontend/wrangler.jsonc` has SPA not-found handling; verify `/stages`, `/results`, `/records`, `/rules` after publish |
| Public stage visibility | CODE PRESENT — MANUAL PRIVACY QA OPEN | Service filters non-deleted PUBLISHED/COMPLETED stages; test anonymous access |
| Public results/records visibility | CODE HARDENED — MANUAL PRIVACY QA OPEN | Queries exclude deleted/unpublished stages and private participant/car records; test anonymous endpoints |
| Site settings/assets | PARTIAL — IMPROVED | Public allowlist, homepage title/subtitle/blocks, hero image and configured legal links are wired; real hero image still needs to be uploaded |
| Participant self-service registration | DEFERRED | Next block; do not add to public V1 acceptance |
| QR check-in/schema migration | DEFERRED; REMOVED FROM RELEASE CANDIDATE | Reintroduce only after separate requirements and authorization/migration validation |
| ADMIN/JUDGE/participant/anonymous permission matrix | TODO — VERIFY | Preserve server-side role and ownership rules |
| Full CMS, news, SEO, draft/preview/versioning | TODO | Requirements survey and separate design agreement |
| Legal versioning/consent evidence | TODO | Separate requirements and legal review |
| Transactional email/retries/logs | TODO | Separate implementation and delivery tests |
| Offline operation | ARCHITECTURE ONLY | Local hub, queue, sync and conflict UI are not implemented |
| Backups/restore/monitoring | NOT VERIFIED | Verify configuration and perform a documented restore drill |
| Production migration | NOT PART OF THIS RELEASE | No production migration authorized or run |
| Production deployment | NOT VERIFIED | Merge only after final CI; confirm Worker Build success and verify each live route |

## Public V1 boundaries agreed with owner

- Include public home, stages, results, records and rules.
- Defer participant self-service registration and QR check-in to later blocks.
- Agree on a new visual design separately before major design/CMS implementation.
- Follow `docs/DEVELOPMENT_STATUS.md` as the canonical handoff and update this checklist with evidence after each block.

## Required release gate

1. Backend build/lint/unit/E2E and frontend typecheck/build pass on the exact cleaned-up candidate.
2. Anonymous public API checks verify no draft/unpublished stages or private/unapproved data leak.
3. Test mobile widths and loading/empty/error states.
4. Merge/release only after candidate checks. Production migration is not part of this release.
5. Confirm Cloudflare Worker Build succeeds on main and verify live routes. A green local/GitHub build alone is not deployment proof.

## Current truth

Public V1 code is implemented on the feature branch; final CI after removing QR check-in is pending. Main and production remain unchanged. The deployed Worker has not yet been confirmed to serve the new pages. Next: complete CI, release the public-only candidate, then verify each deep link on the live Worker. Full CMS, participant self-service, QR check-in, legal/email workflows, offline operation, RBAC and operational recovery validation remain separate work.
