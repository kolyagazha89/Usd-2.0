# Public prerelease audit and fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit the deployed public/member journeys, repair confirmed code defects, and give an evidence-based release verdict.

**Architecture:** Keep the existing React/Nest/Prisma application and premium design. Public publication/privacy rules belong in the API; route and request failures must leave usable frontend navigation. CI tests synthetic accounts without writing production records.

**Tech Stack:** React 19, TypeScript, Nest, Prisma, node:test/jsdom, Jest, GitHub browser QA.

**Spec:** User request: deep prerelease audit, including public access as a participant, achievements, registration and mobile; fix errors that are in code.

## Global Constraints

- Do not submit real registrations, accept consents, change profiles or delete production data.
- Do not invent legal documents, event addresses or published content.
- Preserve published sporting results and existing account permissions.
- Check 320, 390, 1024 and 1440px in candidate CI; label mocked checks separately from production checks.
- Publish only after required CI succeeds and review has no unresolved important code finding.

## Review Focus

- Malformed/unknown deep links must leave usable navigation, without render crashes or database 500 errors.
- Closed cars and unpublished/deleted stages must not leak through public participation history.
- Network failures must differ from empty or missing entities and support retry.
- Account continuation must preserve the chosen event and protect existing role boundaries.
- Keyboard/nested links and expanded achievements must work at narrow widths.

### Task 1: Establish live baseline and release matrix

**Files:** `docs/audits/2026-10-22-prerelease-audit.md`; existing production API and browser surfaces.

- [ ] Record current revision, live API read-only checks, accepted fresh screenshots and limits.
- [ ] Run frontend/backend baselines, dependency audit and inspect auth/public API contracts.
- [ ] Separate confirmed bugs, content blockers, and untested release risks.

### Task 2: Enforce public API boundaries

**Files:** `backend/src/participants/participants.service.ts`, public participant/stage/result/record controllers, regression specs.

**Interfaces:** Public profile history returns only active registrations at published, nondeleted stages; hidden/inactive cars are redacted. Unknown identifiers retain the existing 404 contract.

- [ ] Add failing tests for history filtering/private cars and invalid public identifiers.
- [ ] Run the tests and record the expected failures.
- [ ] Fix the query/projection and parameter validation; run backend suite, build and lint.

### Task 3: Repair frontend failure and continuation paths

**Files:** `frontend/src/App.tsx`, `frontend/src/public/PublicCommunity.tsx`, `premium-model.ts`, existing regression fixtures/tests and scoped CSS if necessary.

**Interfaces:** Malformed links show a navigable missing-page state. Entity 404 differs from transport failure. Login continuation shows the chosen event; public result identities link only to public profiles.

- [ ] Add failing behavioral tests for malformed stage URLs, entity failures/retry, public/private result links and event continuation.
- [ ] Repair the identified branches without rebuilding the visual design.
- [ ] Add associated password hint and hide archive placeholder car-name parts.
- [ ] Run complete frontend tests/build; extend browser scenarios for consent, registration form, errors and expanded mobile results.

### Task 4: Verify candidate, publish and report

**Files:** `scripts/candidate-browser-qa.mjs`, `docs/audits/2026-10-22-prerelease-audit.md`.

- [ ] Request one fresh whole-branch review; resolve important findings with regression tests.
- [ ] Publish a reviewable PR and wait for required checks; inspect mobile artifacts.
- [ ] Merge/deploy within existing authorization, verify production assets and repaired live flows.
- [ ] Deliver release verdict, fixed defects, residual blockers, checked matrix and honest limits.

## Execution ledger

- Baseline: origin/main `67727f91`; clean checkout, branch `fix/prerelease-public-audit`.
- Frontend baseline: 36/36 tests passed.
- Backend baseline initially unavailable because dependencies were absent; installing locked dependencies before testing.
- Ruling: execute inline under the user's explicit instruction to fix bugs; no additional plan approval round.

- Ruling: unknown identifiers already return404 (confirmed live); no speculative UUID validation change.
- Ruling: PublicCommunity was already keyed by route; pending-request navigation check passed without a code fix.
- Review found an adjacent inactive-car leak through result/record responses; failing tests confirmed it, both public projections/sanitizers repaired.
- Backend dependencies installed and Prisma generated with a disposable localhost URL; full suite now 691 tests. Generated client files are excluded from this change.
- Frontend37 tests, backend build/lint and dependency audits passed. Candidate browser CI and live release verification pending.
