CREATE TABLE "ParticipantStageInspection" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "status" "InspectionStatus" NOT NULL,
    "checkedByUserId" TEXT,
    "createdByUserId" TEXT,
    "checkedByName" TEXT,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ParticipantStageInspection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParticipantStageInspection_participantId_stageId_key"
ON "ParticipantStageInspection"("participantId", "stageId");
CREATE INDEX "ParticipantStageInspection_stageId_idx" ON "ParticipantStageInspection"("stageId");
CREATE INDEX "ParticipantStageInspection_status_idx" ON "ParticipantStageInspection"("status");
CREATE INDEX "ParticipantStageInspection_checkedByUserId_idx" ON "ParticipantStageInspection"("checkedByUserId");
CREATE INDEX "ParticipantStageInspection_createdByUserId_idx" ON "ParticipantStageInspection"("createdByUserId");

ALTER TABLE "ParticipantStageInspection"
ADD CONSTRAINT "ParticipantStageInspection_participantId_fkey"
FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipantStageInspection"
ADD CONSTRAINT "ParticipantStageInspection_stageId_fkey"
FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipantStageInspection"
ADD CONSTRAINT "ParticipantStageInspection_checkedByUserId_fkey"
FOREIGN KEY ("checkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ParticipantStageInspection"
ADD CONSTRAINT "ParticipantStageInspection_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Consolidate historical registration- and class-level inspections into one
-- authoritative row per participant/stage. FAILED wins if historic decisions conflict.
WITH legacy AS (
  SELECT r."participantId", r."stageId", i."status", i."checkedByUserId", i."createdByUserId",
         i."checkedByName", i."checkedAt", i."notes", i."createdAt", i."updatedAt"
  FROM "Inspection" i
  JOIN "Registration" r ON r."id" = i."registrationId"
  UNION ALL
  SELECT r."participantId", r."stageId", ci."status", ci."checkedByUserId", ci."createdByUserId",
         ci."checkedByName", ci."checkedAt", ci."notes", ci."createdAt", ci."updatedAt"
  FROM "RegistrationClassInspection" ci
  JOIN "RegistrationClass" rc ON rc."id" = ci."registrationClassId"
  JOIN "Registration" r ON r."id" = rc."registrationId"
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY "participantId", "stageId"
    ORDER BY CASE WHEN "status" = 'FAILED' THEN 0 ELSE 1 END, "checkedAt" DESC, "createdAt" ASC
  ) AS rank
  FROM legacy
)
INSERT INTO "ParticipantStageInspection" (
  "id", "participantId", "stageId", "status", "checkedByUserId", "createdByUserId",
  "checkedByName", "checkedAt", "notes", "createdAt", "updatedAt"
)
SELECT 'migrated-' || md5("participantId" || ':' || "stageId"),
       "participantId", "stageId", "status", "checkedByUserId", "createdByUserId",
       "checkedByName", "checkedAt", "notes", "createdAt", "updatedAt"
FROM ranked WHERE rank = 1;

-- Add the composite relation used by each registration to read the shared inspection.
