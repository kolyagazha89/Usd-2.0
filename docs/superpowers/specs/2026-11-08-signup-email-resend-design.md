# Signup verification resend

Owner request: check Ubuntu now and provide verification-email resend after signup with limits.

Use the existing public resend endpoint and current auth screen. After successful account creation (including initial mail failure), show the registered address, resend control, 60-second countdown, and a way to request verification after returning to login. Keep verification recovery distinct from password reset; capture the submitted address so editing the login address cannot silently change its recipient. No automatic resends.

Server policy: 60 seconds between verification attempts, including initial signup; at most 5 resends in a rolling hour per account. Reserve cooldown, count audit reservations, create token and audit atomically in one PostgreSQL transaction; SMTP happens after commit. Provider failures consume a reservation. Existing valid links survive resend failure. Keep identical public responses for missing, verified, inactive, limited and failed accounts; fixed retryAfterSeconds=60. Preserve existing per-IP recovery limit60/15min. No schema migration, secrets, mail provider or infrastructure privilege changes.

Approaches: client-only throttle is bypassable; process-memory account limits reset on restart. Chosen implementation reuses the existing persisted timestamp and AuditLog under the same user-row reservation transaction. No additional persistence dependency.

Verify unit boundaries and concurrency using real PostgreSQL18 where available; React runtime tests for successful/failed signup, double-click, countdown, mode switching, request errors and return visits; responsive browser checks. Ubuntu diagnostic is already queued behind the deploy waiter; current public SHA remains40e1f708. CI, deployed revision and real receipt remain separate evidence.
