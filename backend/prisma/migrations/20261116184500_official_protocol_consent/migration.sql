-- A distinct decision to publish FIO alongside official competition results.
-- No backfill: imported or previous legal checkbox history is not evidence of this consent.
-- Separate nullable statements are accepted by the installed production gate.
ALTER TABLE "User" ADD COLUMN "protocolConsentAt" TIMESTAMPTZ(3);
ALTER TABLE "User" ADD COLUMN "protocolConsentVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "protocolConsentRevokedAt" TIMESTAMPTZ(3);
ALTER TABLE "Registration" ADD COLUMN "protocolConsentAt" TIMESTAMPTZ(3);
ALTER TABLE "Registration" ADD COLUMN "protocolConsentVersion" TEXT;
