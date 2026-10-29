# Prerelease verification implementation plan

> Execution: inline under the owner's explicit instruction to proceed without approval pauses.

**Goal:** Keep the existing release recoverable until the actual public application has passed read-only acceptance.
**Architecture:** Reuse the root-installed verifier inside the existing rollback boundary; make its public probes validate real API shapes, protected access and shipped frontend assets. No migration or live data write.
**Spec:** `docs/USD_MASTER_PLAN.md`, sections 2, 3, 14–15.

## Constraints and review focus

- Only app.usd-russia.ru and api.usd-russia.ru; never follow cross-origin redirects.
- No credentials, login attempts, customer writes, schema changes or database restarts.
- An empty JSON object is not a successful public API response.
- An HTML fallback for a missing JS/CSS asset is not a working frontend.
- Public acceptance failure must roll back before writing deployed-sha.
- An untrusted verifier must fail before changing images; rollback must remain possible if public ingress is unavailable.

## Tasks

1. Refresh existing PR #307 against main, preserving current restore rehearsal and explicit local-HDD supervised restrictions. Run the existing offline policy and release suites.
2. Add failing Python tests for invalid settings/stages/records, unprotected authenticated routes, SPA/asset failures and redirects. Implement bounded, allowlisted read-only probes; run the complete Python verifier suite.
3. Add a failing release regression for a healthy container behind broken public ingress. Require a trusted root-owned verifier before image replacement and call it inside the rollback boundary. Extend isolated mock/real-Docker fixtures, then run the complete release rehearsal in disposable CI.
4. Review the whole diff, push to the existing #307 head and verify exact-head CI. Update #114 with separate code/CI/Ubuntu/live states. Host rollout remains unverified until access exists.

## Execution ledger

- Baseline: frontend 148/148 tests; backend 59 suites, 761/761 tests; backend build passed with disposable DATABASE_URL.
- Existing #307 merged into worktree, conflicts resolved in favor of current main's newer real backup transport and supervised legacy-Compose handling, plus the #307 default-off gate/query/sudo protections.
