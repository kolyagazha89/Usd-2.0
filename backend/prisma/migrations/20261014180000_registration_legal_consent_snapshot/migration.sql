ALTER TABLE "Registration"
  ADD COLUMN "privacyConsentAt" TIMESTAMPTZ(3),
  ADD COLUMN "privacyConsentVersion" TEXT,
  ADD COLUMN "termsAcceptedAt" TIMESTAMPTZ(3),
  ADD COLUMN "termsVersion" TEXT,
  ADD COLUMN "consentCapturedByUserId" TEXT;
