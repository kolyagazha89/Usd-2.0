# Teams and commanders Implementation Plan

**Goal:** Complete normalized team management, scoped commanders, membership approvals and moderated team news/achievements while preserving historic names.
**Architecture:** Add independent Team, TeamMembership and TeamPost records, enforce rights in TeamsService using current database actors and transactional audit. Adapt existing admin/public views and add a participant team tab.
**Tech Stack:** NestJS, Prisma 7, PostgreSQL 18, React 19, Jest and Node tests.
**Spec:** `docs/TEAM_COMMANDERS.md`, `docs/USD_MASTER_PLAN.md` §10.

## Constraints and review focus

No live database/domain writes, replay, imports or backfill. ADMIN-only assignment/publication; stale roles and cross-team IDs must fail. Private participants never appear publicly. Legacy strings survive renames/archive/join/leave. Concurrent approval/request changes never create two current memberships. Published text cannot bypass review through commander edits.

- [x] Write failing service/HTTP integration tests for ownership, privacy, approval, publication and immutable archive text; fail against missing module before implementation.
- [x] Add the isolated schema migration, service/controller/module and minimal self-service RolesGuard admission. Run the tests on a dedicated local synthetic PostgreSQL 18 database.
- [x] Replace bulk-edit team directory, add cabinet team management, extend public directory; test actual rendered forms and interactions with synthetic requests, then build/typecheck.
- [x] Run backend/frontend suites, lint and builds. Record exact evidence, pending release gates and commit the coherent milestone without pushing or merging.

Completion evidence and remaining release gates: `docs/TEAM_COMMANDERS.md`. Local execution completed without pushing, merging or applying any live migration.
