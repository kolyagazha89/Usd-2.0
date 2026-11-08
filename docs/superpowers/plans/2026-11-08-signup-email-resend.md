# Signup Email Resend Implementation Plan

> **For agentic workers:** Execute inline with a fresh independent final reviewer.

**Goal:** Recover missing signup verification emails without allowing mail abuse.
**Architecture:** Existing React auth screen and public Nest endpoint; durable PostgreSQL cooldown/audit quota.
**Tech Stack:** React19, Nest12, Prisma7, PostgreSQL18.
**Spec:** ../specs/2026-11-08-signup-email-resend-design.md

## Global Constraints
60-second account cooldown including signup;5 resends per rolling hour; existing60 recovery requests/15min/IP. Generic response for all accounts. No migration or production data changes.

## Review Focus
- Concurrent requests and restarts must not reset quota.
- Initial SMTP failure must leave account recoverable.
- A failed resend must preserve previous working links.
- Unknown/verified/inactive accounts must not disclose existence or send.
- Switching modes/recipient while a request is pending must not misattribute success.

### Task1: Durable server limits
Files: backend/src/auth/auth.service.ts, auth.resend-verification.spec.ts and consent spec; backend/test verification concurrency fixture as available.
Interface: resendVerificationEmail(email) -> generic success/message/retryAfterSeconds60.
- [x] Write and run failing boundary, failure and quota tests.
- [x] Transactionally reserve account cooldown, audit quota and token; retain previous links; SMTP after commit.
- [ ] Test success/failure/limit and persistence; build/lint.

### Task2: Signup recovery UI
Files: frontend/src/App.tsx, new focused verification-resend component and runtime tests.
Interface: component consumes registeredEmail/initial cooldown; posts existing endpoint with fixed captured address.
- [x] Write failing signup/recovery runtime tests.
- [x] Add resend panel after signup and explicit login recovery, countdown and pending/error handling.
- [ ] Run full frontend tests/build and browser320/390/768/1440.

### Task3: Review and release
- [x] Independent cross-model review; reproduce and correct any material findings.
- [ ] Publish coherent PR, verify exact-head CI, merge within standing authorization, then verify release independently.
- [ ] Update issue114 with actual Ubuntu/mail/code evidence; keep unverified host acceptance open.
