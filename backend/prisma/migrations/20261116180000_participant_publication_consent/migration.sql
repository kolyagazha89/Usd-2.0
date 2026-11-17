-- A legacy public profile flag is NOT evidence of separate consent.
-- All historical rows start without publication permissions.
-- Each nullable ADD COLUMN is a separate statement for the installed
-- production additive-only Prisma migration gate.
ALTER TABLE "Participant" ADD COLUMN "publicationConsent" JSONB;
ALTER TABLE "Participant" ADD COLUMN "publicationConsentAt" TIMESTAMPTZ(3);
ALTER TABLE "Participant" ADD COLUMN "publicationConsentVersion" TEXT;
ALTER TABLE "Participant" ADD COLUMN "publicationRestrictions" VARCHAR(4000);
