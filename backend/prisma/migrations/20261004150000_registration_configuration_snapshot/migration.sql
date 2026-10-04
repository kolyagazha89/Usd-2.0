-- Add a historical snapshot reference from a registration to the car configuration version used at registration time.
ALTER TABLE "Registration"
ADD COLUMN "configurationVersionId" TEXT,
ADD COLUMN "configurationSnapshot" JSONB;

CREATE INDEX "Registration_configurationVersionId_idx"
ON "Registration"("configurationVersionId");

ALTER TABLE "Registration"
ADD CONSTRAINT "Registration_configurationVersionId_fkey"
FOREIGN KEY ("configurationVersionId")
REFERENCES "CarConfigurationVersion"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
