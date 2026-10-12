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
- PR #2 [merged](https://github.com/kolyagazha89/Usd-2.0/pull/2) to `main` on 2026-10-12; merge commit `a22dae511f9c37b8bb0bc52859e355b30be878a7`.
- Changes: Manrope/Inter typography; black/white/red tokens; stronger motorsport hero; image frame/fallback; consistent stage cards, result/record tables, rules panel, focus states, reduced-motion support, responsive mobile navigation and layouts.
- Semantic hooks added to existing public page/card/table markup; no API contracts, data model, permissions, or production migrations changed.
- Merge-commit Frontend CI passed [run 38210055084](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210055084); Backend CI passed [run 38210055069](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210055069); frontend production bundle passed [run 38210055243](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210055243); Cloudflare Workers Build on `main` succeeded [build 92067b77](https://dash.cloudflare.com/d7ec254ad62bb3a09d2c32bb5f443cbf/workers/services/view/usd-2-0/production/builds/92067b77-214f-45fa-b1c3-5970083f18c7). The separate Wrangler publish job was skipped because `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are empty in GitHub Actions; native Cloudflare Workers Build succeeded. Direct browser verification of live routes remains open because the current tool environment cannot reach the Worker URL. Anonymous privacy QA and real-device mobile QA remain open.
- Media dependency: the real USD car/event hero photo still needs to be uploaded in Admin → Настройки сайта → Главная; CSS fallback remains available.

## Public website status

| Area | State | Next action |
|---|---|---|
| Public home, stages, results, records and rules | MERGED TO MAIN; FRONTEND CI PASS | Confirm each live route in a browser after Cloudflare production build |
| Premium public visual system | MERGED TO MAIN; FRONTEND/BACKEND CI PASS; MAIN WORKER BUILD PASS | Complete live-route, anonymous privacy and real-device mobile QA |
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

Open and refresh `/`, `/stages`, `/results`, `/records` and `/rules` on the live Worker, check anonymous privacy behavior and review narrow mobile widths on a real phone. The design PR is merged, frontend/backend CI pass, frontend production bundle passes, and Cloudflare's native main-branch Worker Build succeeds. The separate GitHub Wrangler publish job is still skipped because the two Cloudflare secrets are absent; the successful native Worker Build is the active release evidence, but direct live route verification remains open. Upload the real USD car/event hero photo in Admin → Настройки сайта → Главная; until then the CSS fallback remains.
