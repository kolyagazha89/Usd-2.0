# Follow-up release delta — 2026-10-15 11:05 UTC

This is the latest evidence snapshot. CI/deployment checks are not a substitute for browser acceptance or the owner's verification of authenticated save flows.

## Latest merged code

- **Main commit:** `cb058cfee75e50919b7c7e049d3f28d1c1e65d92` (PR #167; PR #166 is included in its ancestry).
- **PR #166 — release QA fixes:** merged. Backend CI and frontend build passed. Includes strict live input masks, dark form/dropdown/help surfaces, one homepage winner per class, next-stage registration CTA, partner links in footer, forgot-password UI, QR aiming frame, record class visibility controls, and normalization of settings JSON before Prisma persistence. Settings-save behavior must still be verified with an authenticated admin save/read-back.
- **PR #167 — BassRace class inspections:** merged. Backend migration/build/lint/unit/E2E and frontend build passed. Adds independent inspection state per BassRace registration class/participant number, backfills existing registration-level inspection status to each existing BassRace class, and extends bulk pass/fail. Railway deployment is being verified after the merge; do not claim the new API/schema is live until the deployment succeeds.
- **Railway:** deployment `72960e45-2c4a-4493-8c44-43e619dec38c` reached SUCCESS; logs confirm migration `20261015120000_registration_class_inspections` was applied and all migrations completed successfully.
- **Production API smoke after PR #166 and #167:** run #38724045714 passed against main `cb058cfee75e50919b7c7e049d3f28d1c1e65d92`; public settings/stages/current records and published/unpublished result visibility were checked. It did not test an authenticated PATCH of site settings.
- **Cloudflare Workers:** the connected `Workers Builds: usd-2-0` check is failing on the latest main build despite GitHub's React build succeeding. GitHub Actions Wrangler publish remains skipped because Cloudflare account/token secrets are not configured in GitHub. Do not claim the frontend updates are live until the Cloudflare-native production Worker build succeeds and the active Worker is checked.
- **Email:** owner confirmed emails arrive; issue #49 is closed. Reset-password UI is in PR #166; verify its end-to-end link separately during browser acceptance.
- **Settings 500:** PR #166 now JSON-normalizes merged settings before Prisma persistence and adds tests for partial rules and full news payloads. This is a candidate fix, not production acceptance. Keep #156 open until an authenticated admin can save rules, create a news item, reload both and confirm no 500.
- **BassRace inspection:** individual class/number inspections are implemented and merged, but require a real stage with a participant in three BassRace classes to verify three separate rows, independent status/notes, and bulk actions after Railway migration deployment.
- **Records:** admin controls choose which eligible classes publish public records. BassRace and Storm Wall are always excluded from public record output and record accrual; this rule is enforced server-side.
- **Legal package:** owner rejected the current drafts as insufficiently detailed. Rebuild the previously requested 11-document package; use known operator facts only and do not invent the operator address or MKТУ. Organizer approval is required before public publication or enabling registration.
- **Domain/DNS:** untouched. The custom-domain cutover remains the final, separately approved step.

## Remaining acceptance gates

1. Confirm Railway deployment for main `cb058cfee75e50919b7c7e049d3f28d1c1e65d92` succeeds with the new migration applied.
2. Resolve the failing Cloudflare-native Worker build and verify the exact active Worker URL, direct-route refresh, and deployed frontend commit.
3. Authenticated admin: upload/preview/publish DOCX rules; create/edit/publish news; reload settings and confirm read-back. Keep #156 open until successful.
4. BassRace: create one participant registration with three BassRace classes; verify three distinct inspection rows/numbers, independent PASSED/FAILED status, required failure comment, results conflict guard, audit trail and bulk actions.
5. Input masks: RU phone and registration plate in participant, admin quick-create and generic CRUD; try invalid/incomplete input and verify save is rejected. Confirm all dropdowns, helper surfaces, statistics cards and modal forms use USD dark/red styling on desktop/mobile.
6. Public homepage: one winner per class; registration CTA visible when next-stage registration is open; active partner HTTPS links in footer; verify the actual Worker build is live.
7. QR camera: acceptance on real HTTPS iOS Safari and Android Chrome, plus ADMIN/JUDGE roles.
8. Prepare and obtain organizer approval for the full 11-document legal package before enabling registration.
9. Keep domain/DNS cutover as the final separately approved operation.

Master tracker: #114. Detailed owner findings: #165.

---

# Follow-up release delta — 2026-10-15 09:07 UTC

This follow-up supersedes the earlier 08:55 snapshot below where later commits changed the evidence. The frontend and backend are separate deployable artifacts; their verified source commits differ because the latest backend-only change did not require rebuilding the frontend.

## Verified deployed code

- **Backend source:** `3b0cb254b87f2a98e3605022fe7fb42c19ffd24e`. Railway deployment `76fbd742-8663-43b3-8ca2-52f67202ee7f` reached SUCCESS; Nest started; no pending Prisma migrations. Backend CI #820 passed and Production API Smoke #33 passed: https://github.com/kolyagazha89/Usd-2.0/actions/runs/38710433716.
- **Frontend source:** `40432518c1dd5395c70587643c44a968a5196c07`. Frontend CI #637, Frontend Deploy #89 and Cloudflare-native production Worker build all passed. The GitHub Actions Wrangler publish step is skipped because Cloudflare token/account secrets are not configured in GitHub; the connected Cloudflare-native production build did pass.
- **Cross-browser QR scanning:** PR #159 merged as `4826459daf25c74f20186199dd8767d369c2d3cb`; Frontend CI #635 passed, and the resulting Worker production build passed. Scanner uses native BarcodeDetector where available and jsQR fallback otherwise, with same-origin/exact-route checks. Physical HTTPS camera acceptance on real mobile devices remains open under #50.
- **Legal footer links:** PR #160 merged as `40432518c1dd5395c70587643c44a968a5196c07`; Frontend CI #637 passed and Cloudflare production build passed. Footer links to `/privacy`, `/consent`, and `/terms` remain visible when texts are unapproved; those pages still show a pending-approval state and registration remains blocked.
- **Site-settings diagnostics:** PR #157 and follow-up PR #161 are merged. Current backend logs unexpected update failures by phase (`read`, `merge`, `upsert`, `audit`), error class and Prisma code without payload values. This is diagnostic coverage, not a root-cause fix.
- **Site-settings 500s:** eight production `PATCH /site-settings` HTTP 500s were observed between 07:57 and 08:41 UTC before the diagnostics were deployed. No later PATCH attempt has reproduced the issue yet. Keep [#156](https://github.com/kolyagazha89/Usd-2.0/issues/156) open until a real save reproduces and is fixed.
- **Email:** four production `POST /mail/test-trigger` calls returned HTTP 201, which is evidence the configured provider accepted the sends. Actual Inbox/Spam placement and verification-link operation are not confirmed; keep [#49](https://github.com/kolyagazha89/Usd-2.0/issues/49) open.
- **Media:** two earlier transient 500s affected public poster/logo delivery; later requests returned 304. Keep cold-load asset QA under [#11](https://github.com/kolyagazha89/Usd-2.0/issues/11).
- **Legal approval:** footer discovery is fixed, but the organizer still must approve actual legal text/operator details before registration can be enabled. Do not approve on their behalf.
- **Public domain:** no root domain, DNS, nameserver, Tilda or production routing changes have been made. The custom-domain cutover remains a separate step requiring explicit approval.

## Remaining release gates (do not mark release-ready until resolved)

1. Reproduce and fix #156 settings-save 500s using the new phase diagnostics.
2. Confirm test-email receipt and a working verification link; verify remaining date-based triggers without touching a live event.
3. Browser-check the exact active Worker URL, direct route refresh, anonymous privacy, desktop/mobile layouts and cold-load logo/poster delivery.
4. Test QR camera scanning on HTTPS in iOS Safari and Android Chrome; verify ADMIN/JUDGE permissions with real sessions.
5. Obtain organizer approval for the actual privacy policy, consent, terms and operator details.
6. Keep public domain/DNS cutover as a separately approved final operation.

---

# Current release delta — 2026-10-15 08:55 UTC

This entry supersedes older status statements below where they conflict with the evidence recorded here. It records code/deployment checks, not owner/browser acceptance.

## Current main and deployment evidence

- **Main commit:** `335e0509a827b6839dbe16a02ae99dda43bc3e9f`.
- **Backend CI:** passed on the current commit — [run #809](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38708740106).
- **Railway API:** deployment `3f204b7e-7aae-4415-8731-a93799cc30e1` reached `SUCCESS`; Nest reports “Application successfully started”; no pending Prisma migrations.
- **Production API Smoke:** passed on the current commit — [run #29](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38708924341), checking health, public stages, results privacy and records.
- **Frontend CI / bundle:** passed on parent commit `8b783c6b7b040b96b7c31d051c85c18b39c7ebc3`. The only code change from that parent to current main is backend-only save-failure diagnostics.
- **Cloudflare native Worker:** `Workers Builds: usd-2-0` passed for current main commit `335e0509a827b6839dbe16a02ae99dda43bc3e9f`. The previous main commit `8b783c6...` failed, so the green result is specific to the newer build. The GitHub Actions Wrangler publish job is still skipped because `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` are not configured in GitHub secrets; the Cloudflare-native connected build is separate and passed.
- **Public route QA:** exact active Worker URL is not available through the current connected tools. Direct-route refresh, anonymous privacy and desktop/mobile behavior have not been independently browser-verified. Do not treat CI/API smoke as a substitute.
- **Email:** production logs show four `POST /mail/test-trigger` responses with HTTP 201 at 07:50–07:52 UTC. The endpoint returns success only after the configured provider accepts the send, so provider acceptance is evidenced; Inbox/Spam placement and a working verification link are still unconfirmed. Keep [#49](https://github.com/kolyagazha89/Usd-2.0/issues/49) open until receipt is confirmed.
- **Site settings save:** eight production `PATCH /site-settings` requests returned HTTP 500 between 07:57 and 08:41 UTC. [#156](https://github.com/kolyagazha89/Usd-2.0/issues/156) remains open. [PR #157](https://github.com/kolyagazha89/Usd-2.0/pull/157) merged safe phase/error-code diagnostics and a regression test, but this is not yet a root-cause fix; no production data was changed.
- **Public media:** two transient HTTP 500 responses were observed for a stage poster and branding logo at 01:40 UTC; later branding/splash asset requests returned 304. Track this under [#11](https://github.com/kolyagazha89/Usd-2.0/issues/11) and re-check current behavior.
- **Legal:** actual operator details and legal texts still require organizer approval before registration is considered production-ready. Do not approve drafts on the organizer’s behalf.
- **Domain safety:** no root domain, DNS, nameserver, Tilda or production routing changes were made. Do not change them without explicit owner approval.

## Remaining release gates

1. Reproduce and fix #156 using the new safe logs; confirm valid settings save and read back.
2. Verify actual email receipt and verification link; test the remaining notification triggers separately.
3. Verify direct refresh and live behavior for `/`, `/stages`, `/results`, `/records`, and `/rules` on the exact active Worker URL; test narrow mobile layouts and anonymous privacy.
4. Check poster/logo delivery on a cold load; confirm mobile QR inspection on HTTPS and ADMIN/JUDGE permission boundaries.
5. Obtain organizer approval for the real legal documents and operator details.
6. Keep root-domain/DNS cutover as a separate explicitly approved final step.

---

# Current release delta — 2026-10-15 12:30 UTC

## Merged regulation fixes

- **PR #148** — archived regulation revision IDs cannot be reused to publish altered content. Backend CI passed (Prisma generation/migrations, dependency audit, build, lint, unit and E2E tests).
- **PR #149** — public stage detail pages render the immutable regulation snapshot stored for that stage. Frontend and backend CI passed.
- **PR #150** — legacy stage pages disclose when no historical rules snapshot exists. Frontend CI #626 and Backend CI #798 passed; merged as `2476802ebf61629cbd2efbbc3be919c87cf5c0bf`.
- **Railway API:** live deployment for the current main merge commit `2476802ebf61629cbd2efbbc3be919c87cf5c0bf` is `SUCCESS`, service is Online with one running replica and no reported Railway service alerts. This verifies backend deployment state, not every API route or business flow. HTTP metrics showed 6 5xx responses in the last two hours; detailed logs could not be read with the current viewer permission, so the cause remains unconfirmed.

## Remaining production release gates

- **Cloudflare Worker build:** Cloudflare bot reports failed preview builds, including PR #150. The dashboard log URL is not accessible from the current connected session; the root cause remains unknown. Do not claim the frontend is deployed.
- **GitHub deployment workflow:** Wrangler publish is skipped when `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is missing. A successful bundle build alone does not publish the Worker.
- **Live site:** latest available web inspection of `usd-russia.ru/records` and `/rules` still shows the Tilda site. The root page timed out; `/stages` and `/results` could not be independently fetched. No DNS, root domain, or production routing changes were made.
- **Email:** user confirmed test emails now work. This confirms the tested flow only; other event triggers and registration confirmation delivery are not all independently verified.
- **Legal:** organizer approval of actual operator details and legal texts is still required before production registration is considered ready.
- **Browser/device QA:** direct route refresh, responsive layout, participant profile/car/registration flows, mobile QR camera, and ADMIN/JUDGE permission boundaries still need live browser/device acceptance.
- **Final gate:** run API smoke against the current live deployment; read Cloudflare build logs, fix the actual build failure, and verify the active Worker revision; then complete direct-route/mobile and role/QR end-to-end checks. Only change public domain/DNS after explicit owner approval.

---

# Current release delta — 2026-10-15 02:01 UTC

## Additional merged fixes after the previous status note

- **PR #143 / commit `357f63a189ea16b1e9e848eef4874582e862c199`** — reminder triggers now compare UTC calendar days because stage dates are date-only values stored at UTC noon. A stage two calendar days away is not mislabeled as a three-day reminder. Reminder idempotency keys include the scheduled date so a rescheduled stage can receive a new reminder. Backend build/lint/unit/E2E and production API smoke passed.
- **PR #144 / commit `0711ed91561ff9ef62b625835b4bb448046ff8fc`** — homepage latest-stage selection compares against the start of the current UTC calendar day, not the current timestamp, so today's stage is not prematurely treated as past. Frontend and backend CI passed.
- **PR #142 / commit `b51c077d09b85ba5ca26dbb66c90d1d7323a71df`** — this release-status update was merged into the development-status document.

## Current external release blockers

- **Mail:** #49 remains open until the configured provider accepts a real test and the recipient confirms Inbox/Spam. CI/API smoke are not delivery evidence.
- **Legal:** legal drafts remain unapproved; organizer must approve the real operator details and legal text before production registration is considered ready.
- **Browser/device QA:** public direct routes and refresh, responsive layouts, consent links, profile/car/stage registration, QR camera on HTTPS, ADMIN/JUDGE authorization and CRUD flows still need hands-on acceptance.
- **Cloudflare frontend:** GitHub's publish step is skipped due missing `CF_API_TOKEN` / `CF_ACCOUNT_ID`; Cloudflare-native `Workers Builds: usd-2-0` is failing on main and PR branches. The actual frontend serving revision is not verified. Investigate the Cloudflare build logs/dashboard before calling frontend rollout complete.
- **API:** production API smoke passed on main commit `357f63a` (protected publication endpoint, public settings/stages/records, published/unpublished results and private-field checks). Re-check after subsequent backend deploys.
- No public domain, DNS, nameservers or production routing were intentionally changed.

This is an incremental release-status note; older dated entries below are historical and may describe earlier commit states.

---

# Release status update — 2026-10-15

## Recently merged

- **PR #140 / commit `8df7591e47909ebb75005e408fb89e877a435a50`** — homepage latest results are limited to the latest past public stage with published results; no fallback to older stages. CI passed.
- **PR #138 / commit `6a93d1a8377b9fc99b9a110214400bc640b40ace`** — four stage email triggers (registration opens only to active newsletter opt-ins, successful registration confirmation, 3-day reminder, 1-day reminder), responsive HTML + plain-text templates, idempotency/logging/retry, explicit consent capture, separate newsletter opt-in/revocation, draft legal documents, legal approval gate, registration consent snapshots and published rules revision protection. Backend build/lint/unit/E2E and frontend CI passed. Production API smoke passed on the merge commit; that smoke checks public API/privacy, not email delivery.
- **PR #141 / commit `a1b89d91421eb1727e659d08257d4764aff921c2`** — enabled homepage News and Partners blocks now render even when there are no published items, with clear empty states. Backend and frontend CI passed.

## Release gates still open

- **Email delivery (#49):** trigger code and CI are complete, but each mail type still needs a real provider send and Inbox/Spam confirmation. Provider acceptance must not be reported as delivery.
- **Legal approval (#52):** `docs/legal/DRAFTS.md` contains unapproved drafts. The organizer must approve real operator details and texts before these documents are treated as final.
- **Browser QA:** direct routes/refresh, responsive layout, consent checkboxes/links, profile/car/stage flows, QR camera on HTTPS, role access and admin CRUD still require hands-on browser/device acceptance.
- **Frontend deploy:** the GitHub workflow's Cloudflare publish step is skipped while `CF_API_TOKEN` / `CF_ACCOUNT_ID` are absent. Do not infer that a successful frontend build means Cloudflare is published.
- **Production verification:** API smoke passed on the merge commit; independently confirm the exact live backend deployment/migration state and verify frontend serving revision before declaring production rollout complete.
- **No domain/DNS/routing changes** were intentionally made.

This status is evidence-led: code merged, CI, smoke checks, live deployment, and owner/browser acceptance are distinct states.

---

> **Обновление релизного аудита — 2026-10-14 21:23 UTC.**
>
> - **Email/legal PR #138:** code head `7a40b72f98fa8a825f69ea307afef81828c226e1`; Backend CI passed (Prisma generation/migrations, build, lint, 196 unit tests, E2E), Frontend CI passed. The current branch includes all four event triggers, consent source/revocation metadata, the shared USD template across system emails, registration/on-site consent controls and unapproved legal drafts.
> - **Homepage PR #140:** head `3149fe113ca6a96fc56bf681e610e3fa3f38a7de`; frontend + backend CI passed. Results are restricted to the latest past public stage; leaderboard distribution is SPL 3 / BFSPL 2 / BDWSPL 1 and no arbitrary fallback is used when direction metadata is missing.
> - **Current main:** `dcf880b21173d5fd0f6603d418217809601e219a`. Neither PR is merged; their changes have not been deployed. Railway `usd-api` latest observed deployment remains SUCCESS from `2026-10-14T16:49:53Z`; no deployment was triggered by these feature branches.
> - **External gates still open:** real email provider acceptance + Inbox/Spam receipt; organizer approval of legal texts and operator details; Cloudflare-native frontend deployment and browser QA for direct routes/responsive layouts; live mobile QR scan and ADMIN/JUDGE permission smoke tests. Do not infer those from CI.
> - **Safety:** public domain, DNS and production routing were not changed. Do not enable registration until legal approval is complete.
>
> **Обновление — 2026-10-14, 17:02 UTC — CI подтверждён на email/legal code head.**
>
> - PR #138 code head `2a4a8ea5ac1fee244dbab88d97331e9de3c72c32`: Backend CI passed (Prisma generation/migrations, build, lint, unit tests, E2E); Frontend CI passed (build). После этого в статусе/документации будет только описательное обновление; если код изменится, CI нужно повторить.
> - PR #140 homepage latest-results fix `5e4bffc7d032dda94d49f4fa1da11421f2efa9f4`: frontend and backend CI passed.
> - Main recovery commit `dcf880b21173d5fd0f6603d418217809601e219a` restores the known-good source tree from `1b83edaae686aaa3aa2ceeca24a790514d4fc69a`; backend CI passed migrations/build/lint/unit/E2E.
> - Main restoration is source/CI evidence only. The exact live deployment serving traffic is not independently verified. No domain/DNS/routing changes.
> - Release blockers remain: organizer approval of the actual legal texts; real-provider test mail plus Inbox/Spam receipt; browser QA for profile, public pages, stages, QR inspections, roles and car/configuration routes. Keep #49 and #52 open until those gates pass.
>
> **Обновление — 2026-10-14, 16:45 UTC — юридические согласия и email-триггеры расширены.**
>
> - Серверная регистрация аккаунта теперь проверяет, что организатор утвердил юридические документы, и записывает фактическую версию согласия; интерфейсная блокировка не является единственным уровнем защиты.
> - Для существующих аккаунтов добавлены `GET/PATCH /auth/legal-consent`; регистрация участника на этап отклоняется, если версия обязательных согласий устарела или отсутствует. Форма этапа предлагает незаполненные обязательные согласия только если их нет, без предустановленных галочек.
> - Публичная выдача юридических текстов скрывает черновики до утверждения; в админке добавлен явный процесс утверждения. Изменение текста сбрасывает утверждение; требуется сначала сохранить документ, затем отдельно утвердить его.
> - Добавлены тесты версии юридических документов, неизменяемости опубликованного регламента и серверной проверки согласий; команда `npm run test:consents` объединяет соответствующие тестовые suites.
> - Почтовый worker использует отдельные события, идемпотентный журнал, HTML/text шаблоны, тестовые триггеры ADMIN, проверку согласия перед повторной отправкой и ограниченные повторы для ошибок провайдера. Напоминания запускаются в 72-часовом и 24-часовом окнах с периодической проверкой.
> - **Проверка:** актуальный head PR #138 ещё не имеет подтверждённого CI run. Последние подтверждённые зелёные backend/frontend runs были на более раннем commit `f2e03d6b374cc352067aef666c4031ab63a7e92f`; успешность текущего кода не заявляется. Реальную доставку, browser QA и утверждение документов нужно закрыть отдельно.
>
> **CI note — 2026-10-14, 16:18 UTC:** frontend and backend CI passed on commit `f2e03d6b374cc352067aef666c4031ab63a7e92f`. A later backend run on intermediate commit `9825ecf05079835e2eb431dcaf542c54a00d5a12` failed during unit tests with Jest unable to resolve `email-notifications.service` from its test at that snapshot; no test assertions ran for that suite. Current PR head `18555ab2f79324e16aa0beba020c06db6af78a8a` contains the service file and separate reminder-threshold tests; fresh CI for the current head must be observed before treating this block as green.
>
> **Обновление — 2026-10-14, ветка `feature/stage-email-triggers-consents` (реализация в работе, CI ещё не проверен).**
>
> - Создана задача [#136](https://github.com/kolyagazha89/Usd-2.0/issues/136) для четырёх email-триггеров, согласий и юридических черновиков.
> - В схему добавлены версии/временные отметки согласия на обработку данных и пользовательское соглашение, отдельный opt-in на новости, отзыв согласия, фиксация версии регламента при регистрации и уникальный журнал уведомлений. Добавлена миграция `20261014190000_stage_email_notifications`.
> - Добавлены серверные триггеры: открытие регистрации (только подтверждённым активным пользователям с действующим opt-in), подтверждение успешной регистрации, плановые напоминания за 3 и 1 день. Журнал использует уникальный ключ события для защиты от дублей; ошибки провайдера записываются как FAILED, а API-acceptance не считается доставкой.
> - Добавлены адаптивные HTML + text/plain шаблоны в стиле USD и ADMIN endpoint `POST /mail/test-trigger`; в настройках сайта появилась форма для тестирования каждого шаблона на собственный email.
> - В форме создания аккаунта добавлены две обязательные выключенные по умолчанию галочки (обработка данных и пользовательское соглашение) и отдельная необязательная галочка новостей. В профиле участника добавлена возможность включить/отозвать новостную рассылку. На регистрации этапа требуется отдельное подтверждение регламента.
> - Добавлены unit-тесты для выбора аудитории, отказа от рассылки, дедупликации, шаблонов, логирования ошибок и обязательных согласий. Результаты CI ещё не получены; код нужно считать непроверенным до успешного backend/frontend CI.
> - Добавлен `docs/legal/DRAFTS.md`; тексты явно помечены как черновики и требуют утверждения организатором. До утверждения юридические документы остаются release blocker.
> - Не менялись production, DNS, публичный домен или routing. #49 остаётся открытым до фактической проверки входящих/спама; #52 остаётся открытым до утверждения документов и проверки ссылок в браузере.
>
> **Текущий статус — 2026-10-14, 15:32 UTC. Эта запись имеет приоритет над всеми более старыми статусами ниже.**
>
> - **Main:** `010d04bc6c56216f451fd17fa141b4f148ebcd45`. Backend CI прошёл: [run 38589768819](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38589768819). Production API Smoke прошёл: [run 38589836515](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38589836515).
> - **Railway API:** последний deployment `010d04bc` — SUCCESS, сервис Online, 1 running replica, 0 crashed. Миграция `20261014160000_stage_results_publication` успешно применена в deploy кода PR #126; pre-deploy теперь выполняет `prisma migrate deploy` перед безопасным historical-import bootstrap.
> - **Публичный API:** smoke проверил 12 публичных этапов, 11 текущих рекордов, 10 опубликованных наборов результатов и 2 непубликованных набора (для них API возвращает 404); сканирование ответов не обнаружило email, телефон, госномер автомобиля, passwordHash или tokenHash. Неавторизованный запрос на публикацию отклонён HTTP 401.
> - **Результаты:** PR #126 merged; отдельная публикация реализована и production API smoke подтверждён. QA issue #125 закрыт.
> - **Email:** фактическая доставка после последних изменений **не подтверждена**. В Railway присутствуют имена переменных Gmail API OAuth, значения секретов не читались; Resend-переменные отсутствуют. SMTP выключен по умолчанию из-за сетевых ограничений. Нужен реальный тест отправки и подтверждение появления письма в почтовом ящике; ответ провайдера «принято» не равен доставке.
> - **Frontend / Cloudflare:** GitHub Actions собрал production bundle, но шаг `Publish Cloudflare Worker` был пропущен из-за отсутствующих `CF_API_TOKEN` / `CF_ACCOUNT_ID`. Текущий Cloudflare-native Worker build/deploy и прямые маршруты последнего main не подтверждены; необходим browser smoke test. Не менять корневой домен `usd-russia.ru`, DNS или production routing до финального разрешённого cutover.
> - **Юридические тексты:** не выдумывать финальные документы. Политика, согласие, условия и реквизиты должны быть утверждены организатором.
> - **Следующие release gates:** подтвердить Cloudflare Worker deployment и прямое обновление `/`, `/stages`, `/results`, `/records`, `/rules`; проверить UI на телефоне/десктопе; провести реальную email-проверку; получить утверждение юридических текстов; домен/DNS — только отдельным финальным шагом.
>
> **Исторический аудит на начало 2026-10-14 (не переопределяет текущие статусы выше):**
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

Latest merged main: `75651fb366cd6dd5f21cdd3934c138fdca41ba45`.

- PR #96 merged as `1070fd12fde9532202fcecb250baf600c8702d70`: the verification-resend response explicitly says it does not confirm delivery, while keeping the same public response for unknown, verified, rate-limited and pending accounts.
- Production logs identified the mail failure: Gmail SMTP attempted an IPv6 connection to port 465 and returned `ENETUNREACH`. The running code prefers IPv4 DNS results and bounds SMTP connection timeouts.
- Backend CI passed on current main [run 38530529024](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38530529024). Railway deployment `9e5a90d1-6acf-4284-af90-36471a262323` succeeded for `75651fb`; Nest started successfully. Cloudflare native Worker Build for the same main commit passed.
- Email delivery is **not yet verified and remains blocked on provider setup**. The current Railway environment has no `RESEND_API_KEY` or `RESEND_FROM_EMAIL`; SMTP has already failed on the current Railway network. The backend supports Resend over HTTPS. Owner action: create/verify the sending domain in Resend, then set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Railway. Suggested sender after domain verification: `USD <noreply@usd-russia.ru>`. Do not paste API keys into chat or commit them to Git.
- GitHub Actions' separate Wrangler publish job skipped because `CLOUDFLARE_API_TOKEN` and/or `CLOUDFLARE_ACCOUNT_ID` are absent. Cloudflare's native main-branch Worker Build succeeded; direct route/refresh and anonymous privacy checks still need owner-side browser verification.
- No root-domain/DNS/Tilda changes were made. Keep `usd-russia.ru` root DNS untouched until the owner explicitly approves the cutover.

### Remaining release checks

1. Configure Resend and verify an actual email arrives in the inbox.
2. Verify direct navigation/refresh on `/`, `/stages`, `/results`, `/records`, `/rules`.
3. Run anonymous privacy checks and real-device mobile QA.
4. Confirm media-library upload, preview and deletion on the live Worker/API.

---

# USD 2.0 — Development status and source of truth

Last reconciled: 2026-10-13. Read this file and `docs/PHASE_1_STATUS.md` before every work block. Update status only with evidence.

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


## Participant profile validation — 2026-10-12

- Branch: `fix/profile-international-validation`; pull request [#27](https://github.com/kolyagazha89/Usd-2.0/pull/27).
- Centralized browser-side international phone and vehicle plate checks in `frontend/src/profile-validation.ts`; the participant portal uses them before saving.
- Added equivalent server-side validation in `backend/src/participants/profile-validation.ts`; participant create/update and car create/update use the service guards, so bypassing browser validation does not bypass validation.
- Phone input now requires an explicit international country prefix, a recognized calling code, plausible national-number length, and rejects repeated-digit/obviously malformed values. This is syntax/plausibility validation, not proof that a phone number is assigned or reachable.
- Plate validation covers the existing 16 USD country choices: RU, BY, KZ, US, FI, NO, EE, LV, LT, PL, UA, GE, AZ, CN, MN, KP. Russian Latin lookalikes are normalized for checking; US validation remains generic because formats vary by state.
- Added backend unit cases for accepted/rejected international phones and plates.
- Profile team editing already uses a native select sourced from `GET /participants/teams`; server-side profile create/update now rejects arbitrary team values and matches existing/catalog team names case-insensitively. The team list is deduplicated case-insensitively.
- PR #27 was merged to `main` as `cbfd59c0cff9b440541f0fef75624709b2ffb69d`. Latest branch Backend CI (build, lint, unit, E2E) and Frontend CI passed before merge; the native Cloudflare Workers build for the merge commit also succeeded.
- Railway's first production deployment for the merge commit remained in `BUILDING` with no new build logs after 2026-10-12 19:04 UTC. The same `main` source was reconnected to trigger a fresh build at 19:06 UTC; runtime deployment remains pending and must be confirmed before claiming production behavior is live.
- Live HTTP checks for the public Worker and Railway API still fail at DNS resolution from the current execution environment, so public routes, logo cold-load and anonymous API behavior remain runtime-unverified.
- No database schema change or production data migration.


## DOCX rich-formatting pass — 2026-10-12

- PR [#29](https://github.com/kolyagazha89/Usd-2.0/pull/29) preserves Word bold/italic runs and clickable external links in headings, paragraphs, list items and table cells while retaining flattened text for existing search/compatibility.
- Unsafe link schemes are dropped at parse time and again before rendering. Admin preview and public /rules use React text rendering; no imported HTML is executed.
- Added regression tests for bold/italic, links in paragraphs/table cells and rejection of unsafe schemes. Backend CI passed build, lint, unit and E2E on run [38296715212](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38296715212); Frontend CI passed on run [38296715211](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38296715211).
- No schema change, database migration, or production data mutation. The original DOCX remains the downloadable source. Deployment and live /rules verification are separate release gates.
- Still outstanding in the broader public-site block: live direct-route/refresh QA for all five routes, anonymous runtime privacy checks, cold-load logo verification, real-device mobile/loading/empty/error QA, and upload of the selected real USD hero photo. Regulation follow-ups include editable section hierarchy, restoration of prior revisions and rules snapshots tied to historical stages.


## Engineering handoff — 2026-10-13

This section records changes merged after the previous status notes; it does not mean the product is complete.

- Main branch at handoff: `6ea3b48cb437a6203b84ffe09025b8701f485138`.
- PR #36: registration DTO accepts multi-class selections up to 32 classes; regression tests cover more than five classes and the DTO limit.
- PR #37: public `/results` selects the newest published/completed stage with public results when no `stageId` is supplied.
- PR #38: participant portal keeps the selected tab synchronized with the `?tab=` URL when navigating back from dedicated configuration pages.
- PR #39: frontend and backend phone validation now use explicit national-number lengths for Norway (+47), North Korea (+850), and Mongolia (+976), with backend regression cases. CI passed build, lint, unit tests and E2E tests for this change.
- Deployment status: repository CI success is not proof that the Cloudflare frontend or Railway API is serving this exact commit. Verify both independently before announcing production rollout.
- Remaining release work: perform end-to-end browser QA across participant registration, car configurations, admin stage lifecycle, results/import, inspections, records, rules, and responsive layouts; review stale open PRs before porting anything; confirm deployment and smoke-test the production routes.



## Release candidate and Timeweb handoff — 2026-10-13

- PR [#43](https://github.com/kolyagazha89/Usd-2.0/pull/43) is merged as `ab66c9123108a02c588ab4c83e8bad3609a0973f`. It removes the configuration editor/details blocking modals and renders these workflows as full-page views. Frontend CI [run 38411405345](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38411405345) and backend CI [run 38411405454](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38411405454) passed.
- The current deployment target decision is a purchased Timeweb VPS, not a final Cloudflare Worker deployment. The existing Railway/Cloudflare setup remains the current hosting until the owner explicitly approves a controlled cutover.
- PR [#44](https://github.com/kolyagazha89/Usd-2.0/pull/44) merged as `4e90f89075f8bee3f0d7a0c3d8137685d3cb2857`. It adds Dockerfiles, Nginx SPA routing, Docker Compose, Caddy HTTPS for `app.usd-russia.ru` and `api.usd-russia.ru`, the Timeweb guide, and Docker-build validation. Frontend CI [run 38413569524](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38413569524), backend CI [run 38413545901](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38413545901), and Docker validation [run 38413545490](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38413545490) passed; post-merge main checks also passed (frontend [38413853522](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38413853522), backend [38413853289](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38413853289), Docker [38413853233](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38413853233)).
- No server has been provisioned or accessed; no DNS, nameserver, Tilda, live database, or production storage changes have been made.
- Production is **not yet release-accepted**. Outstanding gates: complete CI, verify Docker builds, provision Timeweb and compatible object storage, take and test a database backup/restore, migrate existing production data and media, then run the end-to-end smoke test list in `deploy/timeweb/README.md` after explicit DNS approval.
- Preserve the root `usd-russia.ru` Tilda site. Use the app/API subdomains for acceptance first; never start the API against an empty replacement database when existing USD history must be retained.
