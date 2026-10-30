# Teams and commanders — implementation decisions (2026-10-30)

Implements USD_MASTER_PLAN §10 and the owner's instruction to finish the agreed scope autonomously. These are minimum implementation decisions, not newly attributed owner requirements.

- ADMIN creates a normalized team, assigns/revokes its commander, edits its name and description, and archives/reactivates it. Commander is scoped to a team, never a new system role. ADMIN remains the full-access system role.
- A verified, active account with a linked participant may request one team membership at a time. That team's commander or ADMIN approves/rejects the request or removes membership. The participant may cancel/leave. Requests disclose only the participant name and city to that team. No commander can access another team's roster management or participant/car/account private fields.
- Membership is independent from `Participant.team`: the historical string is never rewritten by team management, rename, membership, archive or migration. The public directory retains legacy string-based teams and explicitly separates archive associations from approved current members. No automatic linking, import, merge or backfill is performed.
- Commanders edit their team's description and draft/submit its news and achievements. Only ADMIN publishes/unpublishes. Published content cannot be edited by a commander until ADMIN returns it to draft, preventing unreviewed changes to public content. Posts are plain text, with length limits and audit records.
- Changes use transactions, resource ownership checks and constrained membership/post states. Duplicate normalized names, commanders and concurrent membership requests are rejected without partial writes.
- Additive migration `20261030060000_team_commanders` only creates new tables/indexes/foreign keys. It is staged for later supervised release after a fresh backup and isolated restore rehearsal; no live migration or historical-data edits are authorized by this implementation.

Acceptance evidence belongs in the completion entry after tests. Prerelease deployment, migration approval/rehearsal and real device acceptance remain separate gates.

## Local implementation evidence — 2026-10-30

Scope: local synthetic data only; no deployment, production migration, backfill, messages or primary-domain changes.

- Backend unit suite: 60 suites / 765 tests passed before rebasing onto the current main. Team service denial tests cover forged ADMIN claims, foreign team IDs, publication authority and inactive accounts.
- PostgreSQL 18 HTTP suite: six scenarios passed with real Nest guards, validation, Prisma transactions and database constraints. Includes custom `teams:*` grants that cannot create/assign/publish, a commander without a linked participant, rejection of unlinked join requests, public privacy, draft/review/publish/unpublish, immutable published content, removal, rename/archive/leave/revocation, concurrent requests, unknown fields, inactive and unverified accounts.
- Fresh PostgreSQL 18 rehearsal: generated the schema snapshot at `aa55edbf65ed5aa79272de5843dec27464165ed8`, inserted a historical participant sentinel, applied only `20261030060000_team_commanders`, and proved the participant row unchanged, new tables empty, and invalid storage states rejected. This rehearses the new additive migration; it is not a production-backup restore rehearsal or a replay of the entire historical migration chain.
- Frontend suite: 149 tests passed, including real rendered forms for join/cancel, commander approval, moderation, archive/public content and normalized admin creation.
- Real Chromium at 1440×1000 and 390×844: full application screens used the actual TeamsModule HTTP API and PostgreSQL 18 for every team query/write. Synthetic session/profile/settings responses supplied unrelated app context; this is not real login or physical-device acceptance. Verified create, assign, join, approve, submit, admin publish, public content, leave, archive and revoke; eight screenshots, no page exceptions or horizontal overflow. A failing five-tab mobile navigation assertion was fixed and passed.
- Backend and frontend production builds passed. Backend lint returned zero errors with existing repository warnings; frontend retains the existing large-chunk build warning.

Reproduce database and HTTP checks on a **new empty local database** named `usd_teams_test` (or use an empty `usd_teams_rehearsal_*` database for the migration check only):

```sh
# DATABASE_URL must point to this synthetic loopback PostgreSQL 18 instance.
cd backend
npm ci
node test/team-migration-rehearsal.mjs
npm run build
USD_TEAMS_INTEGRATION_TEST=1 npm run test:e2e -- --runInBand --runTestsByPath test/team-commanders.e2e-spec.ts
```

The new `Team commanders on PostgreSQL 18` workflow reproduces migration and HTTP checks without modifying existing workflows. The rehearsal pins the pre-feature schema revision so it remains meaningful after merge; `USD_TEAMS_BASELINE_REF` may select another explicit pre-feature commit.

For browser reproduction, keep the migrated synthetic `usd_teams_test` database, run `node test/team-browser-server.mjs` from backend, and run frontend with `VITE_API_URL=http://127.0.0.1:55440 npm run dev -- --host 127.0.0.1 --port 55441 --strictPort`. From repository root run `USD_BROWSER_TOOLING=/path/to/node_modules node scripts/team-browser-qa.mjs` where that directory contains Playwright; `/usr/bin/chromium` is the default browser (`CHROMIUM_EXECUTABLE` can override). The test server binds loopback only and imports no application mail modules. Screenshots/results default to `/tmp/usd-teams-browser-qa`; synthetic fixture tokens are written with mode 0600 outside the repository. No live endpoints are allowed by the browser harness.

Release gates remain separate: remote CI evidence, owner-approved fresh backup and isolated restore rehearsal, supervised migration/release through the approved mechanism, and prerelease/physical-device acceptance. Do not mark USD_MASTER_PLAN §10 live accepted from these local results.
