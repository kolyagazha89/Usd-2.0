CREATE TABLE "RegistrationClassInspection" (
    "id" TEXT NOT NULL,
    "registrationClassId" TEXT NOT NULL,
    "status" "InspectionStatus" NOT NULL,
    "checkedByUserId" TEXT,
    "createdByUserId" TEXT,
    "checkedByName" TEXT,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "legacyId" TEXT,
    CONSTRAINT "RegistrationClassInspection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationClassInspection_registrationClassId_key"
ON "RegistrationClassInspection"("registrationClassId");

CREATE UNIQUE INDEX "RegistrationClassInspection_legacyId_key"
ON "RegistrationClassInspection"("legacyId");

CREATE INDEX "RegistrationClassInspection_status_idx"
ON "RegistrationClassInspection"("status");

CREATE INDEX "RegistrationClassInspection_checkedByUserId_idx"
ON "RegistrationClassInspection"("checkedByUserId");

CREATE INDEX "RegistrationClassInspection_createdByUserId_idx"
ON "RegistrationClassInspection"("createdByUserId");

ALTER TABLE "RegistrationClassInspection"
ADD CONSTRAINT "RegistrationClassInspection_registrationClassId_fkey"
FOREIGN KEY ("registrationClassId") REFERENCES "RegistrationClass"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
