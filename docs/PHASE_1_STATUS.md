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
- PR #2 [merged](https://github.com/kolyagazha89/Usd-2.0/pull/2) to `main` as `a22dae511f9c37b8bb0bc52859e355b30be878a7`.
- Added responsive visual tokens, typography, hero/image treatment, card/table/rules styling, focus states and reduced-motion support. API, schema, permissions and production migrations unchanged.
- Merge-commit Frontend CI passed [run 38210055084](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210055084); Backend CI passed [run 38210055069](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210055069); frontend production bundle passed [run 38210055243](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210055243); Cloudflare Workers Build on `main` succeeded [build 92067b77](https://dash.cloudflare.com/d7ec254ad62bb3a09d2c32bb5f443cbf/workers/services/view/usd-2-0/production/builds/92067b77-214f-45fa-b1c3-5970083f18c7). GitHub's separate Wrangler publish job was skipped because `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are empty; native Cloudflare Worker Build succeeded. Live-route browser verification, anonymous privacy QA and real-device mobile QA remain open.

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
| Production deployment | MAIN WORKER BUILD PASS; LIVE ROUTE CHECK OPEN | Cloudflare native Worker Build succeeded; separate GitHub Wrangler publish job skipped due missing secrets; verify `/`, `/stages`, `/results`, `/records`, `/rules` in a browser |

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

## Public-route regression fix — 2026-10-12

- Owner reported the public homepage showed the admin placeholder after login. Root cause: authenticated ADMIN/JUDGE users were always routed to the admin shell for every path; `/` was not a valid admin page.
- Fix merged via [PR #3](https://github.com/kolyagazha89/Usd-2.0/pull/3) as `a4284c7c45d211a61143b7158bea3eabb53c78e0`: public routes render `PublicSite` for logged-in admins/judges; `/login` redirects an authenticated ADMIN/JUDGE to `/admin`; participant portal and admin routes remain unchanged.
- Status at reconciliation: frontend CI [run 38210454477](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210454477) and backend CI [run 38210454285](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210454285) were still running. Live Worker verification is blocked by DNS/network access from the current environment; production deployment is not yet confirmed.


## Public-route QA follow-up — 2026-10-12

- Frontend CI [run 38210454477](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210454477) and backend CI [run 38210454285](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210454285) completed successfully after the ADMIN/JUDGE routing fix. The owner confirmed that the public site appeared.
- Code review identified that an authenticated PARTICIPANT was routed to the participant portal regardless of URL. Branch `fix/public-routes-for-participants`, commit `8dbdf4a7a2b23cd6b5eeaf5f196e9fe2ef9061a7`, narrows the portal guard to `/login`, `/admin...`, and `/participant...` so public routes remain accessible in a participant session. CI/merge pending.
- Live anonymous API and direct-route checks remain unverified by the assistant environment because the Worker and Railway API URLs are not reachable from it. Owner observation is recorded separately and is not presented as independent HTTP verification.
