-- A legacy public profile flag is NOT evidence of separate consent.
-- All historical rows start without publication permissions.
ALTER TABLE "Participant"
  ADD COLUMN "publicationConsent" JSONB,
  ADD COLUMN "publicationConsentAt" TIMESTAMPTZ(3),
  ADD COLUMN "publicationConsentVersion" TEXT,
  ADD COLUMN "publicationRestrictions" VARCHAR(4000);
