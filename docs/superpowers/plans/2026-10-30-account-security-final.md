# Account session hardening — 2026-10-30

Acceptance scope: `docs/USD_MASTER_PLAN.md` sections 7, 10 and 14, tracked by [issue #114](https://github.com/kolyagazha89/Usd-2.0/issues/114). This is a local code and browser verification milestone, not deployment or live acceptance.

## Result

- Start from `aa55edbf65ed5aa79272de5843dec27464165ed8`, preserving the merged password/bulk mutation-success handling, logout network-failure behavior and `authGeneration` guards.
- Integrate the protected JSON/private-media response guards from PR #317. Responses, response bodies, retries and media preflight that cross a logout/login boundary fail closed.
- Identify the current session only when the configured HttpOnly refresh cookie hashes to an active, unexpired session belonging to the authenticated user. Return only `isCurrent:true` on the matching listed row. Missing, malformed, unmatched or rotated-away evidence leaves the existing list unmarked. Revocation authorization still uses the authenticated user and requested session ID.
- Show the proven current-device badge and a tailored confirmation. Successful current-device revocation, password change and bulk revocation clear local credentials and hide the cabinet immediately. A failed mutation preserves the session; failure of the separate logout request does not misreport a committed mutation as failed.
- Share pending logout cleanup between duplicate calls and wait for it before starting a new login. An old cleanup response cannot erase credentials established by that new login. Keep the existing delayed-login/refresh generation checks.
- Explain that other devices' existing access tokens can remain valid for up to 15 minutes; no claim of immediate server-side access-token revocation.

## Verification

The added regressions were run against the unmodified production code first: frontend failures reproduced stale protected/private responses, unsafe preflight, duplicate logout and missing current-device UI; backend failures reproduced absent cookie forwarding and markers. They pass after integration.

- Backend production build: pass. Generate with a synthetic unused localhost `DATABASE_URL`; generation/build does not connect to a database. Full Jest suite: **62 suites, 781 tests pass**. Own-session controller/service tests: **15 pass**. `npm run lint`: exit 0, retaining existing warnings outside the new session tests.
- Frontend production build: pass with the existing large-chunk advisory. Full `npm test`: **170 tests pass**. Coverage includes password and bulk remote-logout failures, current-device revoke error/retry, immediate local logout, relogin during pending cleanup, delayed refresh/login, protected JSON body, private image body, stale 401 and failed/interrupted media preflight.
- `git diff --check`: pass. No schema, migration, dependency, generated Prisma, production data or deployment changes.

Evidence is stored outside the repository in `/workspace/usd-account-final-{frontend,backend}-{build,tests}.log`, `/workspace/usd-account-final-backend-lint.log`, focused/red-test logs and `/workspace/usd-account-final-browser-evidence/`.

## Reproduction

1. Run `npm ci --ignore-scripts` in `backend/` and `frontend/`.
2. In `backend/`, set `DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:5432/synthetic` for `npm run build`, then run `npm test -- --runInBand` and `npm run lint`. The tracked generated client is stale; generation before testing is required. Exclude resulting generated-client churn from the change.
3. In `frontend/`, run `npm run build` and `npm test`.
4. From the repository root, run `USD_BROWSER_TOOLING=<directory containing node_modules/playwright> USD_BROWSER_EXECUTABLE=<chromium path> USD_ACCOUNT_QA_OUTPUT=<evidence directory> node scripts/account-security-browser-qa.mjs`. Keep `frontend/dist` stable during the run. The runner serves it locally and intercepts all remote requests with synthetic credentials and fixtures; no live account writes occur.

## PostgreSQL family serialization

A real rotation/logout race was found after the first browser run: logout by an
already rotated ancestor did not revoke its successor, and throwing inside the
replay transaction rolled back the intended family revocation. Refresh/logout
now acquire the same family advisory transaction lock under READ COMMITTED;
logout revokes only that token family, and replay rejection occurs after
committing family revocation. The browser waits for pending auth response bodies
before cookie cleanup and prevents a new login until it finishes. Unknown-cookie
cleanup runs before token-specific cleanup, so a truncated response cannot lose
the evidence needed to revoke its newly issued family.

Four actual PostgreSQL18 tests pass on a fresh guarded loopback fixture: rotated
ancestor logout with another device preserved, 12 concurrent acquisition-order
runs, committed replay revocation, and current-device marker/token privacy.
The suite creates and deletes only its synthetic user; no table resets or live
DB operations occur. A job in the identity CI workflow runs it separately.

## Limits

Real browser cookie ordering for already in-flight login/refresh responses, cross-tab behavior and live account acceptance remain unproven by the synthetic fixtures. Generation guards discard stale JavaScript credentials/data; explicit response ordering and server family revocation additionally prevent a rotated token surviving logout in the tested scenarios. Cross-tab and physical-device cookie acceptance remain separate checks. No full release-readiness or real-device acceptance claim is made here.

## Guest-page regression found in candidate CI

The generation guard initially rejected unauthenticated public data when guest
bootstrap refresh returned401. It now binds successful responses only when the
request actually carried Authorization; stale401 retries remain guarded even
without a token. Tests first reproduced the failure, then passed with authentic
old-account setup for protected-response cases. Full frontend170 tests and build
pass. Built-browser replay of home/stage at1440/1024/390/320 passed8/8, while the
full generic candidate rerun remains a GitHub acceptance gate. Keyboard anchor
checks now wait for observable URL navigation after Enter instead of asserting
before the browser updates the hash. No timeout increase or test bypass.
