# Participant Account Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Every signed-in participant, administrator and custom judge can manage their own password, email and sessions in the participant cabinet.

**Architecture:** Add one React component and scoped dark styles, using existing self-scoped `/auth` endpoints. Mount it in the profile tab and unlinked-profile cabinet; preserve backend contracts/schema.

**Tech Stack:** React 19, TypeScript, existing API client, node:test/jsdom/esbuild, synthetic Playwright browser.

**Spec:** `docs/USD_MASTER_PLAN.md` sections 7, 10 and 14; delegated account security brief.

## Global Constraints

- Never touch `usd-russia.ru`; synthetic API only, no production requests/writes.
- No backend/schema, shared browser runner, or global stylesheet changes.
- Cabinet stays dark; inputs use at least 16px on mobile.
- Backend does not identify the current session; never invent that label.
- Password changes and bulk revoke include this device: explain, confirm, then clear local auth on success.
- New email needs confirmation from the new inbox; never imply verified mail delivery.

## Review Focus

- Invalid credentials/network errors keep the session and allow retry.
- Duplicate submits produce only one in-flight mutation.
- Unlinked participant profiles do not block staff account settings.
- Session errors and empty results differ; retry recovers.
- Long device strings and narrow screens remain readable without overflow.

### Task 1: Account security and integration

**Files:** Create `frontend/src/ParticipantAccountSecurity.tsx`, `frontend/src/participant-account-security.css`, `frontend/test/account-security.test.mjs`, `frontend/test/fixtures/account-security.tsx`; only import/mount changes in `frontend/src/App.tsx`.

**Interfaces:** `ParticipantAccountSecurity({email:string,onLogout:()=>Promise<void>})`; existing `apiGet`, `apiPost`, `apiDelete`; `/auth/change-password` receives `{currentPassword,newPassword}`, `/auth/request-email-change` receives `{email,currentPassword}`, `/auth/sessions` lists/revokes all, `/auth/sessions/:id` revokes one.

- [x] Write/run failing rendered-cabinet tests for roles and unlinked access, password/email validation/payload, error retry, session loading/error/empty states, confirmation and duplicate submits.
- [x] Implement component, scoped styles and cabinet insertion points.
- [x] Run targeted tests, full `npm test`, `npm run build`.

### Task 2: Synthetic browser verification

**Files:** Create `scripts/account-security-browser-qa.mjs`; generated evidence untracked.

- [x] Serve local built frontend; intercept all external requests with synthetic responses.
- [x] Exercise participant/admin/judge access, password/email, selected/bulk session revoke and retry on desktop/390/320px; inspect screenshots, input sizes and overflow.
- [x] Inspect diff and final verification, commit, report evidence/limitations without push, merge or live-acceptance claims.

## Candidate verification and review — 2026-10-29

- Baseline frontend suite: 148/148. Final suite: 149/149, including rendered App scenarios for participants, ADMIN, custom judges and unlinked staff. Tests use the real API helper with synthetic fetch, including actual HTTP 401 credential failures and network rejection.
- `npm run build` passes; the existing large-chunk advisory remains. No dependencies, API, backend or schema changes.
- `USD_BROWSER_TOOLING=/tmp/usd-browser-tooling USD_BROWSER_EXECUTABLE=/usr/bin/chromium node scripts/account-security-browser-qa.mjs` exercises 21 role/layout checks and 6 action scenarios at 1440/390/320px, intercepting every remote request. It verifies 16px inputs, no horizontal overflow, password/email error and retry, confirmations, session revocation and local sign-out. Generated report/screenshots: `/tmp/usd-account-browser-qa`.
- Fresh independent review found stale session GET results could restore a revoked row, plus password-cancel keyboard focus loss. Both were reproduced by failing tests, corrected and included in the green full suite. Selected-device success wording now correctly avoids identifying the current device.
- Ruling: existing API does not identify the current session, so the UI describes any session as potentially belonging to this device and does not claim a current-device badge. A selected revoke retains local auth until its current access ends; bulk revoke and password change sign out locally.
- This is local candidate evidence only. Email delivery, Ubuntu deployment, production data preservation, real-device acceptance and the full master plan remain unverified by this change. No primary-domain, production, push or merge actions were performed.
