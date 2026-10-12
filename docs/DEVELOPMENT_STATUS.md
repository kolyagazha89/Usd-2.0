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
- Current `main` before this release remains `71b697c0b1f668aa6bdd054f1f2f1969c8b17329`; it has not been changed by this feature branch.
- Public V1 implementation is on `feature/qr-checkin-and-platform-foundation`, PR [#1](https://github.com/kolyagazha89/Usd-2.0/pull/1).
- Latest code cleanup commit before checklist-only updates: `45ddab1dbd2a048d8e2ac4537a6f1044206f04d2`. It removes QR check-in UI/API/schema/migration from this release scope.
- Earlier public V1 code candidate `dd455e1a3237f8d2fcf71dc7a018e9ca63590cef` passed frontend build/typecheck [run 38181056830](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38181056830) and backend build/lint/unit/E2E [run 38181056848](https://github.com/kolyagazha89/Usd-2.0/actions/runs/38181056848). CI is being rerun after the QR scope cleanup; do not treat those earlier runs as evidence for the cleaned-up head.
- Current `main` Cloudflare Worker Build passed on `71b697c` on 2026-10-11. Worker Build checks for the feature-branch commits failed, and therefore the public-site code has not been verified as published. The separate GitHub deploy workflow previously skipped its publish job because Cloudflare secrets were missing.
- No production migration has been run.

## Agreed block scope (owner confirmed 2026-10-12)

1. Reconcile branches carefully and verify CI.
2. First public release includes home, stages, results, records and rules.
3. Participant self-service registration and QR check-in are deferred to later blocks.
4. Agree on a new visual design separately before a major design/CMS block.
5. Git checklists are the source of truth; survey before each major block and update statuses after work.

## Public website status

| Area | State | Next action |
|---|---|---|
| Public home, stages, results, records and rules | IMPLEMENTED ON FEATURE BRANCH; FINAL CI PENDING | Verify CI on cleaned-up head, then merge/release and open every deep link on the live Worker |
| Direct route fallback | CONFIGURED | `frontend/wrangler.jsonc` uses `not_found_handling: single-page-application`; live behavior still needs verification after publish |
| Public stage endpoint | CODE IMPLEMENTED; PRIVACY QA OPEN | Confirm anonymous access returns only non-deleted PUBLISHED/COMPLETED stages |
| Public results and records | CODE HARDENED; PRIVACY QA OPEN | Confirm unpublished/deleted stages and private participant/car data are excluded |
| Public site settings | PARTIAL — IMPROVED | Public allowlist, configured rules/legal links, homepage title/subtitle/blocks and hero asset are wired; full CMS is out of scope |
| Participant cabinet/self-service registration | DEFERRED | Do not expand acceptance criteria in this block |
| QR check-in and QR schema migration | DEFERRED; REMOVED FROM THIS RELEASE BRANCH | Revisit only after a separate requirements survey and authorization/migration QA |
| Full CMS, news, SEO, preview/version history | TODO | Requirements survey and design agreement first |
| Legal versioning, consent evidence, transactional email | TODO | Separate requirements and security/legal review |
| Configurable RBAC | TODO | Preserve current ADMIN/JUDGE rules; server-side authorization and regression matrix |
| Offline mode | ARCHITECTURE ONLY | Read `docs/OFFLINE_MODE.md`; no implementation claim |
| Backup/restore and monitoring | NOT VERIFIED | Verify actual schedules and document a restore drill |

## Release gates

- Backend build, lint, unit and E2E pass on the exact cleaned-up candidate.
- Frontend typecheck/build passes on the same candidate.
- Anonymous public API does not leak unpublished stages or private/unapproved data.
- Mobile QA covers narrow screens and current iOS/Android browsers.
- Merge/release only after candidate checks; no production migration is part of this release.
- Cloudflare publish and live verification are marked complete only after the main-branch Worker Build succeeds and the deployed routes are checked.

## Next action

Finish CI on the cleaned-up feature head. Then merge/release the public-only candidate and verify the live Worker routes `/`, `/stages`, `/results`, `/records` and `/rules`. The currently deployed `main` does not yet contain these public pages. If the Worker Build fails again on main, inspect the Cloudflare build logs before claiming publication. PR #1 is open and unmerged until these gates are satisfied.
