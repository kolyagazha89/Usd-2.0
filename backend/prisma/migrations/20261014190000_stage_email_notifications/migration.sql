ALTER TABLE "User"
  ADD COLUMN "privacyConsentAt" TIMESTAMPTZ(3),
  ADD COLUMN "privacyConsentVersion" TEXT,
  ADD COLUMN "newsletterConsentAt" TIMESTAMPTZ(3),
  ADD COLUMN "newsletterConsentVersion" TEXT,
  ADD COLUMN "newsletterConsentRevokedAt" TIMESTAMPTZ(3);

ALTER TABLE "Registration"
  ADD COLUMN "rulesAcceptedAt" TIMESTAMPTZ(3),
  ADD COLUMN "rulesVersion" TEXT;

CREATE TABLE "EmailNotificationLog" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "stageId" TEXT,
  "registrationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "providerAcceptedAt" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "EmailNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailNotificationLog_eventKey_key" ON "EmailNotificationLog"("eventKey");
CREATE INDEX "EmailNotificationLog_type_status_idx" ON "EmailNotificationLog"("type", "status");
CREATE INDEX "EmailNotificationLog_stageId_idx" ON "EmailNotificationLog"("stageId");
CREATE INDEX "EmailNotificationLog_registrationId_idx" ON "EmailNotificationLog"("registrationId");
CREATE INDEX "EmailNotificationLog_createdAt_idx" ON "EmailNotificationLog"("createdAt");
