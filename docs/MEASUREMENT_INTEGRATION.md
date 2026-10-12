# USD 2.0 — measurement device integration

## Goal

Connect Term-LAB / SPL-Lab measurement software to the existing USD API without letting raw device data become an official competition result automatically.

Flow:

`Term-LAB / SPL-Lab → authenticated USD API → MeasurementSession (PostgreSQL) → judge review → existing ResultsService → ranking / records / public results`

This is a single-company USD workflow. It is not a separate tenant or a replacement for the current result model.

## Data ownership and trust boundaries

- Device readings are immutable evidence stored as `MeasurementSession`; the official `Result` remains the source of truth for competition standings and records.
- The client supplies device identity, measurement type, measured value/unit, optional frequency/duration, timestamp, device payload, and an idempotency key.
- The server verifies that the registration is active, inspection status is `PASSED`, the registration-class belongs to the registration, and the supplied unit matches the class unit.
- Device input never bypasses the existing result service. Accepting a measurement invokes `ResultsService.create`, which retains its result confirmation, inspection, disqualification, class, ranking, and record rules.
- A measurement is not public merely because it was received. Only the official Result is used by public results/records.
- `ADMIN` and `JUDGE` can capture and review measurements. Participants and anonymous clients cannot call these endpoints. The backend enforces this boundary in the controller and service.
- Acceptance/rejection and intake are written to `AuditLog`. Raw payload is capped at 32 KiB; do not put participant personal data, credentials, or secrets in it.
- The idempotency key is unique. Replaying the same key and payload returns the prior session; reusing the key with a different payload is a conflict.

## API contract

All routes require an authenticated `ADMIN` or `JUDGE` access token.

### `POST /measurements`

Receives one device reading. Required body fields:

- `registrationId`, `registrationClassId` — UUIDs identifying the event registration and its class.
- `deviceType`, `measurementType`, `value`, `unit`, `measuredAt`, `idempotencyKey`.
- Optional: `deviceSerial`, `frequencyHz`, `durationMs`, `rawData`.

Returns a persisted session with `status: RECEIVED` (or the existing session with `duplicate: true` for a safe retry).

### `GET /measurements/registration/:registrationId`

Lists the registration's measurement sessions, newest first, including the class, capture/review staff, review status, and linked official result summary. Staff-only.

### `POST /measurements/:id/accept`

Body may contain `place` and a review `note`. Creates the official result through the existing result domain service, links it to the session, marks the session `ACCEPTED`, and audits the action. A second acceptance is idempotent once the session is already accepted.

### `POST /measurements/:id/reject`

Requires a review `note`. Marks an unaccepted session `REJECTED` and audits the action. Rejected sessions cannot be accepted later; capture a new measurement session for a new attempt.

## Status lifecycle

`RECEIVED → ACCEPTED` or `RECEIVED → REJECTED`

No transition out of `ACCEPTED` or `REJECTED` is exposed. Correcting an official result remains an ADMIN-only operation under the existing result rules.

## Persistence / migration

- Prisma model: `MeasurementSession`.
- Migration: `20261012120000_measurement_session_intake`.
- The migration is versioned in Git only. **Do not run it on production until it has been reviewed, the application build/test gates pass, and a separate deployment/migration plan is approved.**
- Existing Registration, RegistrationClass, Result, ranking, and Record data are not rewritten by this migration.
- Raw measurement history is retained independently of the linked official Result; deleting an official result clears the optional link rather than deleting the measurement evidence.

## Validation gates before merge

- Prisma client generation and backend build.
- Backend lint, unit tests, and E2E tests.
- Verify participant/anonymous denial; judge/admin acceptance; inspection failure; registration/class mismatch; unit mismatch; idempotent retry; conflicting idempotency key; duplicate result; audit events; and no public exposure of raw measurements.
- Confirm Cloudflare/Railway production verification separately. A passing GitHub build is not a deployment claim.

## Next block after API foundation

Build the operator-facing measurement bridge/client only after confirming the concrete export/transport protocol supported by the installed Term-LAB / SPL-Lab versions. Keep device-specific parsing behind an adapter; do not hardcode a speculative protocol into the core API.
