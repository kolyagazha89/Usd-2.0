# USD 2.0 — Phase 1 delivery checklist

This is the acceptance checklist. A code commit is not complete until relevant build/tests and authorization/end-to-end checks pass. Merge, deploy and production verification are separate states.

## Reconciliation — 2026-10-12

- Repo: `kolyagazha89/Usd-2.0`.
- Public V1 PR [#1](https://github.com/kolyagazha89/Usd-2.0/pull/1) merged to `main` as `f3c625ffed6bdc6d8337fc2eb734015e5316da72`.
- Final pre-merge candidate `b2115a9d056dcefa6a4a58b8297d643b39b10410` passed frontend [run 38209225196](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38209225196) and backend [run 38209225339](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38209225339).
- Merge-commit CI passed: frontend [run 38209343973](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38209343973), backend [run 38209344027](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38209344027).
- Cloudflare Worker Build succeeded for merge commit `f3c625f`: [production build](https://dash.cloudflare.com/d7ec254ad62bb3a09d2c32bb5f443cbf/workers/services/view/usd-2-0/production/builds/730fe3df-0aea-4248-8f52-4a84498a6e78).
- The separate GitHub Actions Wrangler publish job was skipped because Cloudflare secrets are absent in GitHub Actions; Cloudflare native Worker Build reports success. Direct live route verification is still open.
- QR check-in UI/API/schema/migration were removed from this release candidate. No production migration was run.

## Public visual system block — 2026-10-12

- Owner approved one unified premium style across home, stages, results, records and rules; full CMS expansion is out of scope.
- Feature branch: `feature/public-visual-system`, current head `88f26a6936559841e6ac8d63beee5449b1be0919`.
- Added responsive visual tokens, typography, hero/image treatment, card/table/rules styling, focus states and reduced-motion support. API, schema, permissions and production migrations unchanged.
- CI for the current head is pending; mobile QA, anonymous privacy QA, PR merge, deployment and live verification are not complete.

## P0 acceptance checklist

| Area | State | Evidence / next action |
|---|---|---|
| Branch reconciliation and merge | COMPLETE | PR #1 merged to main as `f3c625f` |
| Public home, stages, results, records, rules | MERGED; FRONTEND CI PASS | Confirm live direct links and refresh behavior |
| Direct route fallback | CONFIGURED; LIVE CHECK OPEN | Wrangler config uses SPA not-found handling; verify each route on production |
| Public stage visibility | CODE PRESENT — LIVE PRIVACY QA OPEN | Service filters non-deleted PUBLISHED/COMPLETED stages; test anonymous access |
| Public results/records visibility | CODE HARDENED — LIVE PRIVACY QA OPEN | Queries exclude deleted/unpublished stages and private participant/car records; test anonymous endpoints |
| Site settings/assets | PARTIAL — IMPROVED | Public allowlist, homepage title/subtitle/blocks, hero image and configured legal links are wired; real hero photo still needs upload |
| Participant self-service registration | DEFERRED | Next block; do not add to public V1 acceptance |
| QR check-in/schema migration | DEFERRED; NOT IN PUBLIC V1 | Reintroduce only after separate requirements and authorization/migration validation |
| ADMIN/JUDGE/participant/anonymous permission matrix | TODO — VERIFY | Preserve server-side role and ownership rules |
| Full CMS, news, SEO, draft/preview/versioning | TODO | Requirements survey and separate design agreement |
| Legal versioning/consent evidence | TODO | Separate requirements and legal review |
| Transactional email/retries/logs | TODO | Separate implementation and delivery tests |
| Offline operation | ARCHITECTURE ONLY | Local hub, queue, sync and conflict UI are not implemented |
| Backups/restore/monitoring | NOT VERIFIED | Verify configuration and perform a documented restore drill |
| Production migration | NOT PART OF THIS RELEASE | No production migration authorized or run |
| Production deployment | WORKER BUILD PASS; LIVE ROUTE CHECK OPEN | Cloudflare production build succeeded; verify `/`, `/stages`, `/results`, `/records`, `/rules` in a browser |

## Public V1 boundaries agreed with owner

- Include public home, stages, results, records and rules.
- Defer participant self-service registration and QR check-in to later blocks.
- Agree on a new visual design separately before major design/CMS implementation.
- Follow `docs/DEVELOPMENT_STATUS.md` as the canonical handoff and update this checklist with evidence after each block.

## Required release gate

1. Backend build/lint/unit/E2E and frontend typecheck/build passed on the merged candidate.
2. Anonymous public API checks must verify no draft/unpublished stages or private/unapproved data leak; live verification remains open.
3. Test mobile widths and loading/empty/error states.
4. Cloudflare Worker Build succeeded on main; verify direct route refreshes in production before marking the block fully acceptance-tested.
5. Production migration is not part of this release.

## Current truth

Public V1 is merged and CI is green. Cloudflare's production Worker Build succeeded on merge commit `f3c625f`; the separate GitHub Actions publish job was skipped because its Cloudflare secrets are missing, so the native Cloudflare build is the current deployment evidence. Live route/refresh verification and mobile/anonymous privacy QA remain open. QR check-in, participant self-service, full CMS, legal/email workflows, offline operation, RBAC and operational recovery validation remain separate work.
