CREATE TABLE "HistoricalConfigurationConfirmation" (
 "id" TEXT NOT NULL,
 "registrationId" TEXT NOT NULL,
 "versionId" TEXT NOT NULL,
 "confirmedByUserId" TEXT NOT NULL,
 "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "HistoricalConfigurationConfirmation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HistoricalConfigurationConfirmation_registrationId_key" ON "HistoricalConfigurationConfirmation"("registrationId");
CREATE INDEX "HistoricalConfigurationConfirmation_versionId_idx" ON "HistoricalConfigurationConfirmation"("versionId");
ALTER TABLE "HistoricalConfigurationConfirmation" ADD CONSTRAINT "HistoricalConfigurationConfirmation_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoricalConfigurationConfirmation" ADD CONSTRAINT "HistoricalConfigurationConfirmation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CarConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
