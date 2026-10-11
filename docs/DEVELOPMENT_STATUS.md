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

- Production admin login and existing data were confirmed by the operator on 2026-10-12. Do not use production as a test database.
- `main` before reconciliation: `71b697c0b1f668aa6bdd054f1f2f1969c8b17329`.
- Public/QR feature branch before reconciliation: `6897fa6bcac1d036d9d7448b4e11b2d6496ea241`.
- GitHub comparison before reconciliation showed 33 feature-only commits and 9 main-only commits (the old checklist's 32/6 was stale).
- Reconciliation commit `eb858087d391f6178c880716d51dfcf3f8a19b83` has both branch tips as parents; latest Git compare confirms the branch is based on current `main` with 0 commits behind. Follow-up `9b463088a6c37e45b533aaa7ec01821d57830115` enables backend CI on this integration branch. Public QA fixes are in code candidate `5a25cd6327860a69bdca8d853d76f327b4cf7de9`. Draft PR [#1](https://github.com/kolyagazha89/Usd-2.0/pull/1) remains open and unmerged.
- Main backend CI passed on `64ff5839`: build, lint, unit and E2E, [run 38178192756](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38178192756).
- Main frontend CI passed on `8ed4078e`, [run 38177954332](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38177954332).
- Initial reconciled candidate CI passed on `9b463088`: frontend [run 38179098595](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38179098595), backend [run 38179098618](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38179098618). Public QA candidate `5a25cd6327860a69bdca8d853d76f327b4cf7de9` passed frontend [run 38179416418](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38179416418) and backend build/lint/unit/E2E plus disposable-PostgreSQL migration rehearsal [run 38179416410](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38179416410). Frontend CI also passed on docs-only head `15c97b82ed3439ff7b1f7dbddff20707c82a262c` ([run 38179571802](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38179571802)); the current public UI follow-up requires CI on its exact SHA.
- The frontend deploy workflow previously built but skipped Cloudflare publish because credentials were unavailable, [run 38177954189](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38177954189). This is not deployment evidence.
- No production migration or deployment is authorized by this work block.

## Agreed block scope (owner confirmed 2026-10-12)

1. First reconcile branches carefully, then verify CI.
2. First public release is public pages only: home, stages, results, records and rules.
3. Participant cabinet and self-service registration belong to the next block.
4. Design is to be agreed separately before a major design/CMS block.
5. Git checklists are the source of truth; survey before every major block; after answers, finish the agreed scope and update statuses.

## Public website status

| Area | State | Next action |
|---|---|---|
| Branch reconciliation | INTEGRATION CANDIDATE ON FEATURE BRANCH | Run backend and frontend CI on exact candidate; inspect failed jobs and fix regressions |
| Public routes: home/stages/results/records/rules | QA FIXES IN PROGRESS | Responsive navigation/hero, explicit API failure states, deep-link stage selection and results loading are being hardened; exact-SHA CI and public API privacy verification remain required |
| Public stage endpoint | CODE PRESENT — VALIDATION OPEN | Service filters non-deleted PUBLISHED/COMPLETED; anonymous API privacy verification still required |
| Public site settings | PARTIAL — IMPROVED | Hero title/subtitle, supported homepage block visibility/title/order, allowed navigation items and hero-photo upload/display are wired; full CMS and rendering of all configured blocks remain outside this release |
| Participant cabinet and self-service registration | DEFERRED FROM PUBLIC V1 | Keep outside the acceptance scope of this block; survey before next block |
| QR check-in / QR credentials | CODE PRESENT, VALIDATION DEFERRED | Do not run production migration; validate separately with disposable PostgreSQL before release |
| Full CMS, news, SEO, preview/version history | TODO | Requirements survey and design agreement first |
| Legal versioning, consent evidence, transactional email | TODO | Separate requirements and security/legal review |
| Configurable RBAC | TODO | Preserve current ADMIN/JUDGE rules; server-side authorization and regression matrix |
| Offline mode | ARCHITECTURE ONLY | Read `docs/OFFLINE_MODE.md`; no implementation claim |
| Backup/restore and monitoring | NOT VERIFIED | Verify actual schedules and document a restore drill |

## Release gates

- Backend build, lint, unit tests and E2E pass on the exact reconciled candidate.
- Frontend typecheck/build passes on the same candidate.
- Public API does not leak draft/unpublished stages or private/unapproved data.
- Mobile QA covers narrow screens and current iOS/Android browsers.
- Prisma QR migration is tested on disposable PostgreSQL; production migration requires separate explicit release approval.
- Cloudflare deployment is only marked complete after publish success and live verification.

## Next action

Branch reconciliation and baseline CI are complete. Public-site hardening commits `495647d` and a follow-up layout/error-state correction are on the feature branch; run backend/frontend CI on the latest exact SHA. Then inspect workflow job details and verify anonymous stage/results/record privacy, deep links, missing assets and mobile breakpoints. A real hero photo can now be uploaded in Admin → Настройки сайта → Главная. PR #1 remains draft and `main` is unchanged. Do not merge/deploy or run a production migration without a separate release decision.
