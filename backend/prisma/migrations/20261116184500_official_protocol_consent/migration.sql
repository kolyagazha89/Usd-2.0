-- A distinct decision to publish FIO alongside official competition results.
-- No backfill: imported or previous legal checkbox history is not evidence of this consent.
ALTER TABLE "User"
  ADD COLUMN "protocolConsentAt" TIMESTAMPTZ(3),
  ADD COLUMN "protocolConsentVersion" TEXT,
  ADD COLUMN "protocolConsentRevokedAt" TIMESTAMPTZ(3);
ALTER TABLE "Registration"
  ADD COLUMN "protocolConsentAt" TIMESTAMPTZ(3),
  ADD COLUMN "protocolConsentVersion" TEXT;
