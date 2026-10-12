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

## Public-route regression fix — 2026-10-12

- Root cause: `App()` rendered the admin `Shell` for every authenticated non-participant, including public paths. Since `PageContent` only handles `/admin...`, `/` fell through to the generic “Раздел готовится” page.
- Fix merged via [PR #3](https://github.com/kolyagazha89/Usd-2.0/pull/3) as `a4284c7c45d211a61143b7158bea3eabb53c78e0`: public routes remain on `PublicSite` for ADMIN/JUDGE sessions; an authenticated ADMIN/JUDGE opening `/login` is redirected to `/admin`; participant portal and `/admin` routes are preserved.
- Validation state at reconciliation: Frontend CI run [38210454477](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210454477) and Backend CI run [38210454285](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210454285) were still running. Live Worker access from the current verification environment fails at DNS resolution, so production UI and active deployment cannot yet be claimed verified. Next action: confirm both CI runs and Cloudflare's active production deployment, then ask owner to refresh the public URL.


## Public-route QA follow-up — 2026-10-12

- Frontend CI [run 38210454477](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210454477) and backend CI [run 38210454285](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38210454285) completed successfully after the ADMIN/JUDGE public-routing fix.
- Owner confirmed the public site appeared after that fix. This is owner-observed production behavior; independent direct HTTP verification from the current tool environment still fails to reach the Cloudflare Worker/API.
- QA found one related route consistency issue in the code: a signed-in PARTICIPANT was sent to the participant portal for every URL, preventing public pages from rendering during that session. Follow-up branch `fix/public-routes-for-participants` changes the guard so the participant portal stays on `/login`, `/admin...`, and `/participant...`, while public paths render the public site. This is a narrow routing fix; no API, schema, or production migration changes.
- Current follow-up commit: `8dbdf4a7a2b23cd6b5eeaf5f196e9fe2ef9061a7`; CI/merge pending. Continue to distinguish CI success, Cloudflare build/deploy, and live anonymous/mobile verification.


## Participant-session public routing fix — merged 2026-10-12

- PR [#4](https://github.com/kolyagazha89/Usd-2.0/pull/4) merged to `main` as `4470244e190d5f6801028611e694a7f31bd4f3a6`.
- The participant portal is now limited to `/login`, `/admin...`, and `/participant...`; signed-in participants can navigate public paths without being trapped in the portal. ADMIN/JUDGE public routing fix remains intact.
- Frontend CI passed [run 38211339825](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38211339825); backend CI passed [run 38211339834](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38211339834), including build, lint, unit tests and E2E tests. No API/schema change or production migration.
- Owner confirmed the public site appeared after the earlier route fix. Independent direct HTTP verification of the Worker and Railway API remains blocked by DNS resolution in the current tool environment. Cloudflare's new active build/deployment and anonymous live-route behavior therefore remain unverified here; do not mark release QA fully closed until these are checked.


## Startup historical-import safety fix — 2026-10-12

- Code review found `backend/src/scripts/run-historical-migration.ts` could delete all stages/results associated with historical XLSX import jobs during normal service startup when the expected 10 committed stages/results check did not pass.
- Branch `fix/protect-historical-data-on-startup`, commit `adb72c7e81e4ec53d460ac2881b290e0c1a38e86`, removes destructive cleanup from startup. If historical import data already exists, startup logs its state and skips automatic re-import; only a clean database starts the initial historical import. Explicit reconciliation must happen through a controlled admin workflow.
- This is a data-protection fix. It does not restore any data that may already have been deleted by an earlier startup. Railway deployment/log inspection is currently blocked by the connected Railway identity having only viewer permissions for the target service; current production migration outcome remains unverified.


## Public homepage blocks completed — 2026-10-12

- PR [#6](https://github.com/kolyagazha89/Usd-2.0/pull/6) merged as `b9a13ad25e6c47431eb35b48c4a04adc15f30d94`.
- Homepage now renders configured live stream, live results with a configurable refresh interval, latest public results, current records, and public participant cards. The sections respect CMS block enablement, configured order, and homepage visibility toggles.
- Frontend CI passed [run 38212018150](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38212018150); backend CI passed build, lint, unit and E2E steps in [run 38212018146](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38212018146). Container cleanup was still finishing at the last check.
- Production Worker/API route verification and Railway historical-migration logs remain outstanding: the connected Railway identity currently receives a viewer-permission error for the production service, and direct HTTP checks from the tool environment cannot resolve the production hosts.

## Unified public-site finishing pass — 2026-10-12

- Owner asked for the first public phase to be completed as one coherent pass before testing, rather than asking for incremental visual reviews.
- Updated primary nav to Главная / Рекорды / Этапы / Регламент; results remain reachable from home/stage CTAs. Result and record pages now use bespoke responsive cards with real class units (дБ/м/с), locale-formatted values, non-fabricated places, participant/car privacy redaction, and stage context.
- Fixed nearest-upcoming-stage ordering and selected latest results based on stage date. Restyled public stage cards and status/actions. No schema change, database mutation, or production migration.
- Relevant commits on main: c8b1e6c3676d9fd1825c1b3e0daf9d57a168bc5d, 4a6250ebe304b547b1f435173339318d8730b182, a6fba28967ec8862e09351cb3985bca78fb4201f, plus backend privacy commits 47c0fcab120c1a35cd5191338d6386203ffb3dd2 and 43cdcdddea350b697803eba34fe0c0b8a42ba8ac.
- Build truth: initial intermediate backend deploys failed on a TypeScript overload after participant redaction was added. The overload was corrected; a later deployment for the latest UI commit was still BUILDING during the last check, after the backend TypeScript build had progressed to image export. Verify the newest Railway deployment reaches SUCCESS before claiming production deployment.
- Cloudflare Worker direct route checks remain inaccessible from the current environment. The GitHub Wrangler publish job skips without CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID; Cloudflare's native Git-connected build is independent and must be checked separately. Real event/car hero photo remains an owner-managed upload in Admin → Настройки сайта → Главная.

## Public archive and logo reliability fix — merged 2026-10-12

- Owner explicitly deferred the Term-LAB / SPL-Lab adapter. Measurement PR [#9](https://github.com/kolyagazha89/Usd-2.0/pull/9) was closed unmerged; its schema migration was never run and none of its changes entered `main`.
- Public-site fix PR [#10](https://github.com/kolyagazha89/Usd-2.0/pull/10) was merged to `main` as `4ed445d1217b377983e2e18bd7eea14f79a6ea84`.
- Root cause for missing imported historical results: public ResultsService queries filtered historical rows to `verificationStatus: VERIFIED`, while historical XLSX import intentionally creates rows as `PENDING`. This made public result pages empty even though the imported stage was published.
- Fix: public result endpoints now show historical rows attached to published/completed stages; pending historical rows are visibly labelled `АРХИВ · ОЖИДАЕТ ПРОВЕРКИ`. Visibility only changed. `RecordsService` still requires verified historical results before they can create/hold official records.
- Fix: public header logo now prioritizes the stable public asset endpoint, retries the alternate configured URL, and recovers from an earlier image failure if the public asset URL arrives later.
- Added backend regression coverage for published-stage imported-result visibility and CSS badge styles for pending archive rows.
- Main-commit frontend CI passed: [run 38225893705](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38225893705). Frontend production bundle passed: [run 38225893881](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38225893881). Backend CI passed on main code commit `4ed445d`: [run 38225893704](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38225893704), including Prisma generation, test migrations, build, lint, unit and E2E tests.
- The GitHub Wrangler publish job was skipped because Cloudflare credentials are not configured in GitHub Actions. Cloudflare's native Workers Builds integration is separate; its latest production build status has not been independently verified here. Direct HTTP checks from this environment fail at DNS resolution for the Worker and API.
- Still pending: confirm backend CI, confirm the native Cloudflare production build, then verify the live logo, imported result rows, all five routes, anonymous privacy, and narrow mobile layout. No production migration or data mutation.
 
### Current next action

Finish deployment verification for the newest main commit, then perform one consolidated QA pass across /, /stages, /results, /records and /rules at desktop and narrow mobile widths, plus anonymous API privacy checks. Do not ask the owner to test one change at a time; deliver the consolidated release only after those gates are green.

## Owner decision — public-site continuation and regulation management — 2026-10-12

- Owner explicitly deferred Term-LAB / SPL-Lab device integration for the foreseeable future. Do not resume implementation, merge the closed measurement PR, or run related migrations without a separate explicit authorization.
- Added tracking issue [#11 — Public site QA and Word-based regulation publishing](https://github.com/kolyagazha89/Usd-2.0/issues/11).
- Current priority remains finishing the existing public website: direct-route/refresh QA for `/`, `/stages`, `/results`, `/records`, `/rules`; anonymous API privacy checks; logo cold-load reliability; responsive/mobile and loading/empty/error-state QA; document evidence here and in the Phase 1 checklist.
- Planned regulation feature (not yet implemented): dedicated Admin section accepts one large `.docx`; parse Word heading hierarchy, paragraphs, lists, numbering, tables and links into a safe structured document; provide preview and section-structure correction; publish `/rules` with table of contents, stable anchors, responsive tables and search; retain original DOCX download; draft/preview/publish workflow; immutable revisions and restoration; preserve versions applicable to historical stages.
- Implementation constraints: sanitize all imported content; handle malformed/large files and Cyrillic/nested lists/wide tables; agree size/storage/version policy in a short requirements survey before the feature block; no production migration without explicit authorization.
- This is backlog/task tracking only, not a claim that the DOCX importer or live production QA is complete.


## Public-site code review and live-check attempt — 2026-10-12

- Static review of current `main` source completed for public stage, result, participant and site-settings endpoints.
- Code-level findings: public stages are filtered to non-deleted PUBLISHED/COMPLETED stages; public result queries enforce published/completed stage visibility and redact participant/car profile fields when their `isPublic` flag is false; public participant list/profile paths filter private profiles and non-public cars. These are code-review observations, not proof of production runtime behavior.
- Attempted to open the live Cloudflare Worker homepage and Railway public stages endpoint from the available verification environment. Both returned inaccessible/host resolution errors; therefore live deployment, route refreshes, anonymous runtime privacy and logo behavior remain UNVERIFIED.
- Latest docs-only status commits passed Backend CI: [run 38234428894](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38234428894) and [run 38234436546](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38234436546). These runs do not substitute for frontend CI or live browser QA.
- Track remaining acceptance work in [Issue #11](https://github.com/kolyagazha89/Usd-2.0/issues/11). Do not claim production QA complete until a reachable browser/session verifies the actual deployment.


## Public regulation reading page integration — 2026-10-12

- Started from current `main` to avoid merging the divergent older `feature/public-rules-reading-experience` branch wholesale.
- Added `frontend/src/PublicRulesPage.tsx` and integrated it into the existing `/rules` route without changing routing, API contracts, authorization or database schema.
- The page provides a clear unpublished state instead of invented rules, section navigation, Russian-language text search, links to configured legal documents, and calls to action to stages.
- Added responsive dark motorsport styling in `frontend/src/styles.css`; CSS is imported by `frontend/src/main.tsx`.
- Configured document links are restricted to HTTP(S) or same-origin URLs before rendering.
- This is a presentation improvement over the current plain-text rules field, not the DOCX importer. DOCX parsing, rich tables/lists, original-file storage/download, draft/publish and immutable version history remain future work requiring the already-agreed requirements survey before implementation.
- Current branch: `feature/public-rules-page-main-integration`. CI and live deployment/route verification are pending. Do not merge or claim production completion until CI is green and the pull request is reviewed.


## Public-results default-stage recovery — 2026-10-12

- Follow-up branch `fix/public-results-stage-discovery`, implementation commit `42e6fe62d5ad03fcc06bdda9571b583b9d98dc9c`.
- On a direct visit to `/results` with no explicit `stageId`, the page now probes public PUBLISHED/COMPLETED stages newest-first when the default stage has no rows and selects the first stage that actually has public results. This complements PR #15's homepage archive discovery; imported archive rows remain governed by the existing public ResultsService visibility rules.
- A URL with an explicit `?stageId=...` is respected, and changing the stage selector disables automatic discovery so an intentional empty-stage selection stays intentional.
- No backend/API/schema changes and no production migration. Frontend CI and merge are pending; production behavior remains unverified until the code is merged and the public route is checked.
- Stage 2 remains the public-site delivery/QA block: complete the five routes, logo, imported results, rules publishing, responsive states, and privacy checks. Do not call the block fully production-verified until live route and anonymous API checks can be run.
- Stage 3 candidate: participant self-service and cabinet completion, scoped separately after the public release gate. Device measurement integration (Term-LAB/SPL-Lab) remains explicitly deferred.
