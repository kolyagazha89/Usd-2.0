# USD 2.0 — Development status and source of truth

Last reconciled: 2026-10-12. This file is the durable hand-off checklist for all future USD 2.0 work. Read it and the linked phase checklist before starting a task; update it in the same work block when status changes.

## Working rules — always follow

1. **Before each major architectural/product block, ask the owner a short requirements survey.** Do not guess important product choices. After answers, implement the agreed block end-to-end instead of repeatedly redesigning it.
2. Inspect current code, relevant Git history, architecture notes and this checklist before changing files.
3. Use a task/feature branch for substantial work. Do not silently merge divergent branches, deploy, or run production migrations.
4. A commit is not proof of completion or deployment. Record separate states: implemented, tested, merged to `main`, deployed, and verified in production.
5. Keep this checklist current: mark work only with evidence, list blockers and the exact next action. Never leave stale status such as “CI blocked” after it has been resolved.
6. Preserve working production data and established USD rules. Prefer incremental changes over rewrites. ADMIN remains full-access; JUDGE can work across stages and enter results, while result editing/deletion is ADMIN-only.
7. After each major block, report what changed, the commit/branch, what tests passed, what remains, and whether production was actually updated.

## Current repository and production snapshot

- Production admin was confirmed by the operator on 2026-10-12: login works and existing data is present.
- `main` currently points to `64ff5839` (`test(imports): mock registration number preflight`).
- Backend CI passed on `64ff5839`: build, lint, unit tests and E2E tests all succeeded — [run 38178192756](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38178192756).
- Frontend CI passed on `8ed4078e` — [run 38177954332](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38177954332).
- The Frontend Deploy workflow built successfully on `8ed4078e`, but **the Cloudflare Worker publish step was skipped** because Cloudflare credentials were unavailable — [run 38177954189](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38177954189). Do not treat that run as proof of a deployment.
- The public website/QR work is on `feature/qr-checkin-and-platform-foundation` at `cb3070a2`, not merged into `main`. GitHub compare reports this branch is **32 commits ahead and 6 behind** `main`. It has a successful frontend CI run — [run 38174414826](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38174414826); backend CI for this branch has not been verified in the currently inspected runs.
- The current `main` frontend contains the admin application, but the public site shell found in the feature branch is not present in `main`. Therefore, public pages on that branch must not be described as merged or live.
- Before integrating the public/QR branch, reconcile the 6 commits unique to `main` (including recent historical-import/record fixes and API URL fixes) against the feature branch. Review conflicts carefully; preserve both the production admin work and the public/QR work.

## Public website / Phase 1 checklist

| Area | Current state | Evidence / next action |
|---|---|---|
| Admin production access and existing data | VERIFIED BY OPERATOR | Login and data availability confirmed 2026-10-12. |
| Main backend build, lint, unit, E2E | DONE — CI PASS | Run 38178192756 on `64ff5839`. |
| Main frontend CI | DONE — CI PASS | Run 38177954332 on `8ed4078e`. |
| Cloudflare frontend publish | BLOCKED / NOT VERIFIED | Build passed, publish step skipped. Check deployment credentials/settings and verify live commit before claiming deployment. |
| Responsive public website shell: home, stages, results, records, rules | DONE — CODE ON FEATURE BRANCH ONLY | `PublicSite` exists on `feature/qr-checkin-and-platform-foundation`; not in `main`, not confirmed live. Needs responsive/data/privacy QA. |
| Public stage endpoint and published/completed visibility | DONE — CODE ON FEATURE BRANCH ONLY | `GET /stages/public`; verify no draft/deleted stages or unpublished information leaks. |
| Public site settings integration | PARTIAL — CODE ON FEATURE BRANCH | Public settings endpoint and starter fallback exist; the full CMS and publishing workflow do not. |
| QR credential issuance, participant display, judge scan/revoke | DONE — CODE ON FEATURE BRANCH; VALIDATION OPEN | Code and migration exist on feature branch. Backend CI, migration behavior, ownership/role matrix and end-to-end checks remain to be verified on the reconciled branch. Do not run the production migration without an explicit release decision. |
| Full CMS: homepage block editing, navigation, news, rules/legal pages, SEO, draft/preview/version/rollback | TODO | Implement with DB-backed content and a safe publish workflow; routine content edits must not require a code deploy. |
| Public registration end-to-end and participant cabinet | PARTIAL / TODO | Verify stage → car/configuration → classes → consent → confirmation/edit/cancel; preserve event payment-on-arrival rules. |
| Legal document versioning and distinct consent evidence | TODO | Legal review required; no optional marketing consent prechecked. |
| Transactional email, retries and delivery log | TODO | Separate service email from optional marketing; test templates, retries and consent rules. |
| Custom roles/RBAC editor | TODO | Server-enforced permissions, audit and last-active-ADMIN protection. Preserve current ADMIN/JUDGE behavior. |
| Offline event operation | TODO — ARCHITECTURE ONLY | Read `docs/OFFLINE_MODE.md` on the feature branch; local hub, durable queue, sync and conflict UI are not implemented. |
| Privacy/authorization regression matrix | TODO — VALIDATION | Test ADMIN, JUDGE, participant owner/non-owner and anonymous public endpoints against real test data. |
| Backups, restore drill, monitoring and alerts | TODO — VERIFY | Confirm actual schedules and perform a documented restore drill. |
| Safe branch integration | TODO — HIGH PRIORITY | Reconcile feature branch (32 ahead / 6 behind), review diff/conflicts, run full CI on the result, then propose a release plan. No silent merge/deploy. |

## Next work order

1. Treat this status file and `docs/PHASE_1_STATUS.md` on the feature branch as the acceptance checklist. Reconcile the branch divergence before integrating public/QR code.
2. Ask a short requirements survey before the next major public-site design/CMS block; record the answers/decisions before implementation.
3. Complete the public shell data and privacy QA (anonymous access, stage visibility, result/record visibility, empty/loading/error states, mobile).
4. Complete and test participant registration/cabinet and QR flows; validate migrations on disposable PostgreSQL first.
5. Build CMS workflows and legal/consent/email only after agreeing on requirements.
6. Run backend build/lint/unit/E2E, frontend typecheck/build and relevant authorization tests. Update this checklist with actual run links.
7. Prepare a separate deployment/migration plan and get explicit approval before any production schema migration or release.

## Change log

- **2026-10-12:** Reconciled `main` and `feature/qr-checkin-and-platform-foundation`; identified that public website/QR work and the detailed Phase 1 checklist exist on the feature branch, while production `main` is a separate line with 6 unique commits. Recorded current CI evidence and the skipped Cloudflare publish step. Future work must update this file and the feature branch phase checklist as progress is verified.
