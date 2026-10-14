> **Актуальный аудит — 2026-10-14, этот блок имеет приоритет над более старыми статусами ниже.**
>
> - **Main на момент начала аудита:** ee14c551ff45ba7150f390f587646d663a738d6c (PR #107). После аудита UI-блок PR #108 слит в main коммитом 441f1d96a4b98a5f8cb65983ac5990fb97bbf297. Владелец подтвердил, что письмо подтверждения email реально пришло и ссылка успешно подтвердила адрес; issue #49 закрыт.
> - **Исторические профили:** PR #106 слит; владелец подтвердил, что поиск по частичному имени работает. Frontend CI и backend CI после исправления прошли.
> - **UI-блок:** PR #108 — [страница добавления автомобиля вместо модалки и переработанный редактор ролей](https://github.com/kolyagazha89/Usd-2.0/pull/108) — слит. Frontend CI и Backend CI на merge-коммите прошли. Workflow Frontend Deploy собрал production bundle, но шаг Publish Cloudflare Worker был пропущен; фактическую сборку Worker и production-маршруты подтвердить пока не удалось. Поэтому production-релиз этого UI не подтверждён.
> - **Публичный домен:** проверка через веб-инструмент показывает, что usd-russia.ru/records и /rules всё ещё отдают старую Tilda-версию. /stages и /results этим инструментом проверить не удалось. Не менять DNS/корневой домен без отдельного разрешения владельца.
>
> ## Что ещё не закрыто по QA
>
> | Issue | Реальное состояние на момент аудита | Что осталось |
> |---|---|---|
> | #11 — публичный сайт и регламент | DOCX upload/preview/publish, структурированный /rules и история уже есть в коде | Редактирование иерархии разделов; гарантированно неизменяемые опубликованные ревизии и restore; привязка версии правил к историческому этапу; дополнительные parser/security тесты; production direct-route, anonymous privacy и mobile QA; загрузка утверждённого hero-фото |
> | #45 — кабинет участника | Статистика, телефон с выбором страны, фото профиля, страница авто, конфигурации и защита повторной регистрации присутствуют в коде | PR #108 убирает последнюю модалку создания авто; проверить создание/редактирование/фото/повторную регистрацию сквозным сценарием на production и мобильных устройствах |
> | #46 — главная | Код выбирает последний этап по дате, распределяет до 6 результатов 3 SPL / 2 BFSPL / 1 BDWSPL, сортирует рекорды; партнёры и новости предусмотрены | Проверить реальные данные и ранжирование на production; проверить шапку, пустые состояния и мобильную вёрстку. Блок участников скрыт |
> | #47 — рекорды | Фото участника и placeholder предусмотрены в карточках | Проверить фактические данные, публичность фото и мобильные карточки |
> | #48 — этапы | Страница этапа, вертикальная афиша/placeholder, статусы, CTA и условная кнопка результатов присутствуют | Проверить опубликованные/завершённые/отменённые этапы, доступность результатов и возврат после входа на production |
> | #50 — QR-инспекция | QR в кабинете, сканер и серверный сервис инспекций присутствуют в коде; есть PASSED/FAILED и аудит | Сквозной тест мобильного QR, неверного QR, прав JUDGE/ADMIN, отказа с комментарием и блокировки результата после FAILED |
> | #51 — админка/роли/медиа | Модульная навигация, серверные пользовательские роли, новости, партнёры и медиатека уже есть; редактор ролей до PR #108 нуждается в UI-доработке | Проверить назначение/снятие ролей, защиту ADMIN/JUDGE, CRUD контента и загрузку/удаление медиа; закончить PR #108 |
> | #52 — юридические страницы | Маршруты privacy/terms/consent и структурированное чтение регламента реализованы | Владелец/организатор должен утвердить юридические тексты и данные оператора; затем проверить ссылки футера, сохранение и отображение на production |
>
> **Правило статусов:** наличие компонента в коде не равно приёмке. Задачи выше остаются открытыми до завершения соответствующего сквозного или production QA. Интеграция измерительных приборов Term-LAB/SPL-Lab по-прежнему отложена.
>
> ---
>
## Current status — 2026-10-14

Latest merged main: `732bc18ef88810920b383dc009f05b828c39f797`.

- PR #94 merged: server-enforced custom role permissions and admin role matrix. Permanent ADMIN remains a full-access superuser; JUDGE cannot edit or delete results. Migration `20261013190000_custom_roles` is included in the successful Railway deployment.
- PR #95 merged: unified admin media library with latest-version listing, previews, safe deletion of referenced assets, audit trail, and regression tests.
- Email status: Gmail SMTP requests failed with `Connection timeout` in Railway logs. SMTP is not a reliable transport on the current Railway network/plan. The backend now supports Resend over HTTPS and the verification-resend response no longer claims that a message was actually sent.
- Email delivery is **not yet verified**: Railway currently has no `RESEND_API_KEY` or `RESEND_FROM_EMAIL`. Required owner action: create/verify the sending domain in Resend, then configure those two variables in Railway. Suggested sender after domain verification: `USD <noreply@usd-russia.ru>`. Never store or paste API keys in source control.
- CI for merged commit `732bc18`: Frontend CI [run 38529896801](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38529896801) passed; Backend CI [run 38529896819](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38529896819) passed.
- Railway deploy `85195de8-eb0e-4b91-a2d8-e1050a871d96` succeeded for `732bc18`; Nest application started and startup logs show no errors.
- GitHub Actions Frontend Deploy [run 38529896899](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38529896899) passed its build but skipped the Wrangler publish job because GitHub repository secrets `CLOUDFLARE_API_TOKEN` and/or `CLOUDFLARE_ACCOUNT_ID` are absent. Do not claim the frontend was published by that workflow. Cloudflare's native main-branch Worker build and live-route verification for this exact commit still need confirmation.
- Keep `usd-russia.ru` root DNS/Tilda untouched until the owner explicitly approves the cutover. Do not claim production acceptance from CI alone.

### Remaining release checks

1. Configure and verify Resend sender/API key, send a real test email, and confirm delivery.
2. Verify the active Cloudflare Worker build and test direct navigation/refresh on `/`, `/stages`, `/results`, `/records`, `/rules`.
3. Run anonymous privacy checks and real-device mobile QA.
4. Confirm media-library upload, preview and deletion on the live Worker/API.

---

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

## Public archive and logo reliability follow-up — merged 2026-10-12

- Owner deferred the Term-LAB / SPL-Lab adapter; measurement PR [#9](https://github.com/kolyagazha89/Usd-2.0/pull/9) was closed unmerged. No production migration was run.
- Public-site fix PR [#10](https://github.com/kolyagazha89/Usd-2.0/pull/10) merged to `main` as `4ed445d1217b377983e2e18bd7eea14f79a6ea84`.
- Public result endpoints now show imported historical results for published/completed stages even while their historical verification status is PENDING. Public cards label these rows as archive entries awaiting verification.
- Official record eligibility remains unchanged: the records domain still requires historical results to be VERIFIED.
- Public logo loading now prioritizes the stable public asset endpoint and handles the race where the configured URL fails before the public endpoint URL arrives.
- Frontend CI and production bundle passed on main: [frontend CI](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38225893705), [frontend bundle](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38225893881). Backend CI passed on main code commit `4ed445d`: [run 38225893704](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38225893704), including build, lint, unit and E2E tests.
- GitHub's Wrangler publish job skipped due missing Cloudflare secrets. Native Cloudflare production build and live HTTP verification remain unconfirmed; direct checks from this environment fail at DNS resolution. No production migration or data mutation.

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


## Participant-session public routing fix — merged 2026-10-12

- PR [#4](https://github.com/kolyagazha89/Usd-2.0/pull/4) merged to `main` as `4470244e190d5f6801028611e694a7f31bd4f3a6`.
- Public URLs render the public site for authenticated participants as well as ADMIN/JUDGE users; the participant portal remains available on `/login`, `/admin...`, and `/participant...`.
- Frontend CI [run 38211339825](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38211339825) and backend CI [run 38211339834](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38211339834) passed. No API/schema change or production migration.
- Owner observed the public site appearing after the earlier fix. Independent direct live Worker/API verification, anonymous privacy QA and real-device mobile QA remain open because the current verification environment cannot resolve the production hosts.


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

- Public result and record pages now use purpose-built responsive cards rather than table markup; mobile layouts stack cleanly, with the USD black/white/red visual system retained.
- The primary navigation is restricted to Главная / Рекорды / Этапы / Регламент. Results remain reachable from homepage and stage actions, without adding an extra primary-nav item.
- Result values format the DB/MPS enum as дБ / м/с and display numeric values with Russian locale formatting. Missing places no longer get fabricated from list position.
- Upcoming stages are sorted nearest-first; latest published/completed results are selected by actual stage date.
- Stage list cards now include registration state, date/location hierarchy and clearer actions. Reduced-motion support applies to the new card interactions.
- Public results, verified historical results and current records no longer disappear solely because a participant profile is private. Private participant identity and car details are redacted in public payloads; unpublished/deleted stages and unverified historical results remain excluded. No database mutation or migration was performed.
- Relevant code commits: frontend c8b1e6c3676d9fd1825c1b3e0daf9d57a168bc5d, stage cards 4a6250ebe304b547b1f435173339318d8730b182, card styles a6fba28967ec8862e09351cb3985bca78fb4201f; backend public-result/privacy commits include 47c0fcab120c1a35cd5191338d6386203ffb3dd2 and 43cdcdddea350b697803eba34fe0c0b8a42ba8ac.
- Railway build for the final UI commit was observed in progress after TypeScript compilation and image export began; earlier intermediate builds that predated the overload fix failed and were superseded/removed. Do not mark backend deploy complete until the latest deployment reaches SUCCESS.
- GitHub Actions' Wrangler publish path still depends on repository secrets; Cloudflare's native Git-connected Worker build/deploy is a separate path. Direct live-route HTTP checks remain unavailable from this environment. Verify /, /stages, /results, /records, /rules and anonymous privacy behavior before marking the phase production-verified.
- Real USD car/event hero media still needs to be uploaded in Admin → Настройки сайта → Главная; the designed fallback remains available.

### Current release gate

Code is on main; production verification is not yet complete. Confirm the newest Railway deployment reaches SUCCESS, the Cloudflare native Worker publishes the latest main commit, and the five public routes load/refresh correctly. No production database migration is required for this block.

## Owner decision and next public-site tasks — 2026-10-12

- Measurement-device integration (Term-LAB / SPL-Lab) is explicitly deferred for the foreseeable future. Do not resume without separate owner authorization; no migration is authorized.
- Tracking: [Issue #11 — Public site QA and Word-based regulation publishing](https://github.com/kolyagazha89/Usd-2.0/issues/11).
- [ ] Verify direct navigation and refresh on live `/`, `/stages`, `/results`, `/records`, `/rules`.
- [ ] Verify anonymous public API privacy and visibility of imported historical results under the approved archive rules.
- [ ] Verify logo cold-load behavior and fallback.
- [ ] Responsive QA on narrow mobile screens; loading, empty and error states.
- [ ] Record production evidence and blockers; do not equate a successful build with a verified deployment.
- [ ] Future feature, after a requirements survey: Admin-managed DOCX regulation import, preview/editable section hierarchy, safe structured rendering on `/rules`, TOC/anchors/search, original file download, draft/publish, immutable version history and historical-stage version preservation.
- Regulation management is tracked but not implemented yet. No production migration is part of this task.


## Public-site code review and external verification — 2026-10-12

- Static source review found public stage/result visibility guards and participant/car privacy sanitization in place on `main`; runtime behavior remains unverified.
- Attempted live access to the Cloudflare Worker and Railway public stages endpoint; both were inaccessible from the current verification environment. Live route/refresh, anonymous API privacy, and logo cold-load QA remain open.
- Backend CI passed after the status/backlog updates: [run 38234428894](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38234428894), [run 38234436546](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38234436546). These docs-only runs do not validate frontend code or production behavior.
- Remaining work tracked in [Issue #11](https://github.com/kolyagazha89/Usd-2.0/issues/11).


## Regulation page integration follow-up — 2026-10-12

- [x] Implement a dedicated public rules reading page using the existing CMS-managed rules text and legal links.
- [x] Add section navigation, search, explicit unpublished state and responsive layout.
- [ ] Validate frontend CI and merge review.
- [ ] Verify the live `/rules` route and refresh behavior after deployment.
- [ ] DOCX importer, faithful rich-text/table/list rendering, original DOCX download and revision history remain out of this scope and are not implemented by this page-only change.


## Public results recovery and phase handoff — 2026-10-12

- Branch `fix/public-results-stage-discovery`, commit `42e6fe62d5ad03fcc06bdda9571b583b9d98dc9c`: when opening `/results` without an explicit stage ID, an empty default stage no longer prevents visitors from finding imported/public results on another published or completed stage. Explicit `stageId` links and deliberate selector choices remain respected.
- No API/schema change or production migration. Frontend CI/merge and live route verification are pending.
- Public Phase 2 includes: public home, stages, results, records and rules; Word regulation upload/preview/publish; imported historical result visibility; logo fallback; responsive cards; anonymous privacy and direct-route QA. PRs #14 and #15 implement the Word publishing and homepage logo/archive recovery portions; the new results-page recovery is in review.
- Remaining Phase 2 release gate: verify all five routes and refreshes, imported results and logo cold-load, anonymous API privacy, narrow-mobile layouts, and loading/empty/error states. Live production verification has not been independently completed from the current environment.
- Phase 3 direction: finish participant self-service and the participant cabinet (historical-profile matching/linking, profile, cars/configurations, stage registrations and status), only after the public release gate. Term-LAB/SPL-Lab integration remains deferred; no device adapter or related production migration is authorized.


## DOCX rich-formatting follow-up — 2026-10-12

- PR [#29](https://github.com/kolyagazha89/Usd-2.0/pull/29) adds structured inline runs for bold/italic text and safe clickable hyperlinks throughout Word headings, paragraphs, list items and table cells. Both Admin preview and public /rules render the same structure without inserting uploaded HTML.
- Parser safety and compatibility tests cover formatted runs, table-cell links and unsafe URL schemes. Backend CI passed build/lint/unit/E2E [run 38296715212](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38296715212); Frontend CI passed [run 38296715211](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38296715211).
- No schema or production migration. Keep the original DOCX download as the authoritative source.
- Public Phase 2 remains open until live route/refresh checks, anonymous privacy, logo cold-load, mobile and loading/empty/error states are verified. Regulation backlog still includes editable section structure, restoring a prior published revision and preserving the exact regulation applicable to each historical stage.


## Timeweb release gate — 2026-10-13

The final hosting target is a Timeweb VPS. Deployment scaffolding in [PR #44](https://github.com/kolyagazha89/Usd-2.0/pull/44) is merged, and frontend/backend CI plus Docker Compose/image-build validation passed. It is not a live deployment. Keep the current Tilda root and DNS records unchanged. Do not start the production API until the database backup has been verified and the existing production data/media migration plan is ready. Live acceptance remains pending until the VPS, object storage, HTTPS domains and end-to-end smoke tests are verified.
