# Browser push — implementation and acceptance evidence

This implements master plan §11. It is ready for integration review; production configuration, approved migration rollout, provider delivery and physical-device acceptance remain separate release work. No provider messages, Ubuntu operations, production migrations or primary-domain changes were performed for this branch.

## Behavior

Participants manage push in **Мой профиль → Push-уведомления**. Every browser has its own affirmative consent (`web-push-v1`) and independent opening/reminder/announcement topics. The page never requests browser permission automatically. A checked consent box and a click trigger the native prompt. Cancelling the prompt creates no subscription. The default announcement topic is off. Any authenticated participant or custom-role staff member can manage their own devices; endpoints and encryption keys never appear in list APIs. A device bound to another account cannot be claimed. There is a ten-browser limit per user. Deletion revokes server consent before browser unsubscription.

On iPhone/iPad, iOS 16.4+ and an app installed from Safari's **Share → Add to Home Screen** are required. Non-installed iOS explains installation instead of offering a permission prompt. Unsupported or insecure browsers show an explanation. The PWA icons retain the original registered logo's colors and proportions. The push-only worker has no fetch handler or response cache, so authentication, account and API responses are never cached by it.

ADMIN and a custom role with `notifications.view` can inspect summaries; `notifications.create` permits announcements. A composer requires recipient selection, preview and explicit confirmation. A stable request key prevents duplicate enqueue on network retries. Audits record consent/preferences/revocation and announcement creation without browser endpoints or delivery credentials. Stage-scoped announcements target currently active registrations. Queued messages recheck category consent, account status, stage availability and registration membership before dispatch.

Published registration openings enqueue once per stage. Stage updates call the hook; the periodic scheduler also catches a scheduled opening or a failed hook. Active registrants receive reminders on the third and first UTC calendar days before their stage. This matches the existing email scheduler's calendar convention. Editing a stage date creates a new reminder event key. Before delivery, reminders also recheck the published stage date and UTC countdown against their original event key. Rescheduling, completion, cancellation and delayed wording are skipped rather than sending stale reminders. Closed/deleted stages and cancelled registrations are checked again before delivery.

The durable queue claims up to 50 deliveries per run using conditional updates and a two-minute lease. The worker runs every minute when configured. Each provider request has a 15-second deadline. Retryable network/429/5xx failures use 1, 2, 4 and 8 minute delays, with at most five send attempts. Abandoned leases can be recovered; exhausted claims stop. 404/410 expire and remove the subscription. Unsent work older than 24 hours is skipped; message/delivery history is pruned after 90 days. Recovered sends can be repeated if a process dies after provider acceptance and before saving the result; stable notification tags reduce duplicate display. Provider acceptance is never presented as confirmed device delivery.

Only HTTPS endpoints belonging to the explicitly supported Apple, Google, Mozilla and Windows browser push services are accepted. Both registration and dispatch validate public DNS answers, reject mixed private/public answers, verify browser encryption keys, and pin the checked address/family for the TLS request. Redirects are not followed. Notification clicks resolve only to same-origin `/participant`, `/stages` or `/news` paths, with server and worker checks.

## Host configuration

Keep push disabled until approved deployment, legal text review and device testing. No VAPID secrets belong in Git, frontend build variables, logs or CI artifacts.

Required backend-only environment variables:

- `PUSH_ENABLED=true` enables scheduler and sends; any other value disables them.
- `PUSH_VAPID_PUBLIC_KEY` is the public VAPID key (the authenticated settings API exposes only this key).
- `PUSH_VAPID_PRIVATE_KEY` remains on the host in its protected backend environment.
- `PUSH_VAPID_SUBJECT` is the organizer's published `mailto:` or HTTPS contact.

On the deployment host, after installing backend dependencies, run `node scripts/generate-push-vapid.mjs /absolute/protected/path/push.env`. It refuses paths inside the checkout and existing files, writes mode 0600, and never prints keys. It writes `PUSH_ENABLED=false`. Add the subject using the host's protected environment mechanism and merge these settings into the backend container environment. Keep the key pair stable: changing it requires browser resubscription. The browser needs an HTTPS origin. Provider HTTPS access is outbound from the backend; never supply an arbitrary push-service URL or proxy.

`20261030061000_push_subscriptions` creates three new tables and indexes/FKs only. It does not update or delete existing rows. Rollback disables `PUSH_ENABLED` and reverts the application; retain the additive tables and consent records. Before a production migration, follow the existing verified backup/restore and migration approval procedure.

## Reproducible local verification

Use an isolated PostgreSQL **18** database named `usd_push_test` on loopback. The integration suite refuses other names/hosts. Never point this fixture at a live database. Apply migrations with `DATABASE_URL=<isolated URL> npx prisma migrate deploy --config prisma7.config.ts` from `backend`, then run:

```sh
PUSH_TEST_DATABASE_URL=<isolated URL> npm --prefix backend test -- --runInBand src/push
DATABASE_URL=<isolated URL> npm --prefix backend run build
npm --prefix backend test -- --runInBand
npm --prefix backend run lint
npm --prefix frontend test
npm --prefix frontend run build
USD_BROWSER_TOOLING=<temporary Playwright installation> USD_BROWSER_EXECUTABLE=/usr/bin/chromium node scripts/push-browser-qa.mjs
```

The browser script uses built JavaScript/CSS, synthetic API responses and native-push fixtures, and intercepts every remote request. It exercises participant cancellation, click-bound permission, consent, subscribe, preference updates, unsubscribe, iOS installation guidance, admin confirmation and view-only custom grants at 1440, 390 and 320 pixels. Output defaults to `/tmp/usd-push-browser-qa`, including screenshots and a JSON report. Worker tests independently reject forged/cross-origin/traversal paths and assert that no fetch handler exists. PostgreSQL tests mock the transport, so they cannot send messages to a provider.

2026-10-30 local evidence: all 63 historical-plus-push migrations applied to a fresh dedicated PostgreSQL 18 container on loopback; the push suite passed 43 tests including real database ownership/consent, idempotency, concurrent claims, bounded retries, lease recovery, registration-opening/reminder hooks, stage cancellation and 410 cleanup. Eight Chromium browser scenarios passed. The final full backend run passed 797 tests (7 optional PostgreSQL tests skipped there and covered by the focused database run); all 151 frontend tests passed. Both builds passed. Backend lint exited 0 with existing warnings outside push; the push files had no lint warnings. An isolated PostgreSQL 18.6 upgrade rehearsal applied only the new migration over an existing-schema clone, created the three new tables and retained a synthetic historical participant row with the identical before/after checksum `967995cf0bdfb51f2caf4cda41ef1c48`.

Still required before live acceptance: legal consent text approval, protected host VAPID/contact configuration, approved backed-up migration rollout, real provider acceptance, installed iOS Safari 16.4+ and Android Chrome delivery/click/withdrawal on physical devices, and post-deployment monitoring. Local Chromium fixtures cannot prove provider, APNs/FCM, lock-screen display, OS background behavior or physical iOS installation.

2026-10-31 review follow-up: seven no-network dispatch regressions cover current one/three-day reminders, later/closer rescheduling, outdated countdown text, completion and past dates. The five stale cases reproduced before the fix; all seven pass afterward. The focused suite passes 43 unit tests (seven PostgreSQL integration cases require their dedicated database job); backend build and lint pass. Independent feature review found no Critical/Important blocker. Live provider/device acceptance is still open.

Integrated 2026-10-31 verification with teams and current account security: all 64 migrations apply on a fresh synthetic PG18 database; all 50 push tests pass there, six real team HTTP cases pass against the combined schema, and the separate team additive rehearsal preserves its historical sentinel. The full backend passes 828 tests (seven optional PG cases skipped in that run and covered by the focused run); frontend passes 174 tests and its production build. No live records or provider traffic are involved.

The root main-CI verifier now requires successful exact main-push SHA/path results from **Web push on PostgreSQL 18** and **Team commanders on PostgreSQL 18** as well as the existing release checks. Both workflows run on main pushes; their completion may request the existing guarded host service. Install the reviewed current verifier through the existing host setup before host acceptance. A changed Prisma tree still stops automatic release pending supervised backed-up migration and explicit schema approval; these changes do not authorize live migrations.
