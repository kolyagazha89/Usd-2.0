# USD 2.0 — Development status and source of truth

Last reconciled: 2026-10-12. Read this file and `docs/PHASE_1_STATUS.md` before every work block. Update status only with evidence.

## Mandatory workflow

1. Before every major architectural/product block, ask the owner a short requirements survey. After answers, implement the agreed scope end-to-end without repeatedly redesigning it.
2. Inspect current code, relevant Git history, architecture docs and these checklists before changing files.
3. Use a feature/integration branch for substantial work. Do not silently merge, deploy, or run production migrations.
4. Track implementation, CI validation, merge to main, deployment and production verification as separate states.
5. Update these checklists in the same block; include commit SHA, CI evidence, blockers and exact next action.
6. Preserve production data and USD rules: ADMIN has full access; JUDGE works across stages and enters results; result editing/deletion is ADMIN-only.
7. Report accurately. A commit/build is not proof of deployment or production verification.

## Repository / integration snapshot

- Repository: `kolyagazha89/Usd-2.0`.
- Production frontend: Cloudflare Worker `usd-2-0`; backend: Railway; production API: `https://usd-api-production.up.railway.app`.
- Public V1 PR [#1](https://github.com/kolyagazha89/Usd-2.0/pull/1) merged on 2026-10-12 as `f3c625ffed6bdc6d8337fc2eb734015e5316da72`.
- Final merged code candidate `b2115a9d056dcefa6a4a58b8297d643b39b10410` passed frontend CI [run 38209225196](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38209225196) and backend CI [run 38209225339](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38209225339).
- Merge-commit validation passed: frontend CI [run 38209343973](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38209343973), backend CI [run 38209344027](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38209344027).
- Cloudflare Worker Build for merge commit `f3c625f` succeeded: [production build](https://dash.cloudflare.com/d7ec254ad62bb3a09d2c32bb5f443cbf/workers/services/view/usd-2-0/production/builds/730fe3df-0aea-4248-8f52-4a84498a6e78).
- GitHub Actions' separate `Frontend Deploy` workflow passed its build but skipped the Wrangler publish job because its repository secrets are not configured. Cloudflare's native Worker Build reports success; direct HTTP verification of the live public routes remains open.
- No QR schema migration or other production migration was run. QR check-in UI/API/schema/migration were removed from this release candidate.

## Agreed block scope (owner confirmed 2026-10-12)

1. Reconcile branches carefully and verify CI.
2. First public release includes home, stages, results, records and rules.
3. Participant self-service registration and QR check-in are deferred to later blocks.
4. Agree on a new visual design separately before a major design/CMS block.
5. Git checklists are the source of truth; survey before each major block and update statuses after work.

## Public visual system block — 2026-10-12

- Owner approved one consistent premium visual system for all five existing public routes: home, stages, results, records and rules. Full CMS expansion remains out of scope.
- Feature branch: `feature/public-visual-system`; visual implementation commit: `88f26a6936559841e6ac8d63beee5449b1be0919`. Use PR #2's current head SHA as the source of truth for CI; checklist commits may advance it.
- Changes: Manrope/Inter typography; black/white/red tokens; stronger motorsport hero; image frame/fallback; consistent stage cards, result/record tables, rules panel, focus states, reduced-motion support, responsive mobile navigation and layouts.
- Semantic hooks added to existing public page/card/table markup; no API contracts, data model, permissions, or production migrations changed.
- Current validation state: CI has not yet been confirmed for this head. PR review, CI, mobile QA, anonymous privacy QA and production route checks are separate gates. Do not merge or deploy on the basis of the commits alone.
- Media dependency: the real USD car/event hero photo still needs to be uploaded in Admin → Настройки сайта → Главная; CSS fallback remains available.

## Public website status

| Area | State | Next action |
|---|---|---|
| Public home, stages, results, records and rules | MERGED TO MAIN; FRONTEND CI PASS | Confirm each live route in a browser after Cloudflare production build |
| Premium public visual system | IMPLEMENTED ON FEATURE BRANCH; CI PENDING | Review PR and require frontend CI + mobile/anonymous QA before merge |
| Direct route fallback | CONFIGURED; LIVE HTTP CHECK OPEN | `frontend/wrangler.jsonc` uses `not_found_handling: single-page-application`; verify direct navigation and refresh on each route |
| Public stage endpoint | CODE IMPLEMENTED; LIVE PRIVACY QA OPEN | Confirm anonymous access returns only non-deleted PUBLISHED/COMPLETED stages |
| Public results and records | CODE HARDENED; LIVE PRIVACY QA OPEN | Confirm unpublished/deleted stages and private participant/car data are excluded |
| Public site settings | PARTIAL — IMPROVED | Public allowlist, configured rules/legal links, homepage title/subtitle/blocks and hero asset are wired; full CMS is out of scope |
| Participant cabinet/self-service registration | DEFERRED | Do not expand acceptance criteria in this block |
| QR check-in and QR schema migration | DEFERRED; NOT IN PUBLIC V1 | Revisit only after a separate requirements survey and authorization/migration QA |
| Full CMS, news, SEO, preview/version history | TODO | Requirements survey and design agreement first |
| Legal versioning, consent evidence, transactional email | TODO | Separate requirements and security/legal review |
| Configurable RBAC | TODO | Preserve current ADMIN/JUDGE rules; server-side authorization and regression matrix |
| Offline mode | ARCHITECTURE ONLY | Read `docs/OFFLINE_MODE.md`; no implementation claim |
| Backup/restore and monitoring | NOT VERIFIED | Verify actual schedules and document a restore drill |

## Release gates

- Backend build, lint, unit and E2E pass on the merged candidate.
- Frontend typecheck/build passes on the merged candidate.
- Anonymous public API does not leak draft/unpublished stages or private/unapproved data; live privacy QA remains open.
- Mobile QA covers narrow screens and current iOS/Android browsers.
- No production migration is part of this release.
- Cloudflare production Worker Build succeeded; live route/refresh verification remains the final external check.

## Next action

For the design block, open the PR from `feature/public-visual-system`, wait for frontend typecheck/build CI on the exact head, then review mobile and anonymous privacy behavior before merge. Separately, the original production gate remains open: open and refresh `/`, `/stages`, `/results`, `/records` and `/rules` on the live Worker. The production Worker Build succeeded on merge commit `f3c625f`, but direct HTTP/browser verification is not available from this environment, so do not mark the live-route gate complete until the routes are confirmed. Upload the real USD car/event photo in Admin → Настройки сайта → Главная; until then the visual fallback remains.
