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

-- Preserve the existing registration-level decision when migrating old BassRace registrations.
-- New BassRace entries are inspected independently per class/participant number.
INSERT INTO "RegistrationClassInspection" (
    "id", "registrationClassId", "status", "checkedByUserId", "createdByUserId",
    "checkedByName", "checkedAt", "notes", "createdAt", "updatedAt", "legacyId"
)
SELECT
    'legacy-bassrace-' || rc."id",
    rc."id",
    i."status",
    i."checkedByUserId",
    i."createdByUserId",
    i."checkedByName",
    i."checkedAt",
    i."notes",
    i."createdAt",
    i."updatedAt",
    'legacy-inspection-' || i."id" || '-' || rc."id"
FROM "RegistrationClass" rc
JOIN "Inspection" i ON i."registrationId" = rc."registrationId"
JOIN "Class" c ON c."id" = rc."classId"
JOIN "Direction" d ON d."id" = c."directionId"
WHERE regexp_replace(lower(concat_ws(' ', d."name", c."name", c."code")), '[[:space:]_-]', '', 'g') LIKE '%bassrace%'
ON CONFLICT ("registrationClassId") DO NOTHING;
