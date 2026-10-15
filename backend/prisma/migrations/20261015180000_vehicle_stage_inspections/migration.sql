-- Split the former participant-wide inspection into one inspection per vehicle.
-- A registration is unique per car and stage, so registrationId is the stable vehicle-stage key.
INSERT INTO "Inspection" (
  "id", "registrationId", "status", "checkedByUserId", "createdByUserId",
  "checkedByName", "checkedAt", "notes", "createdAt", "updatedAt"
)
SELECT
  'vehicle-' || md5(r."id"),
  r."id",
  psi."status",
  psi."checkedByUserId",
  psi."createdByUserId",
  psi."checkedByName",
  psi."checkedAt",
  psi."notes",
  psi."createdAt",
  psi."updatedAt"
FROM "Registration" r
JOIN "ParticipantStageInspection" psi
  ON psi."id" = r."participantStageInspectionId"
WHERE NOT EXISTS (
  SELECT 1 FROM "Inspection" existing
  WHERE existing."registrationId" = r."id"
)
ON CONFLICT ("registrationId") DO NOTHING;

-- Keep historical rows for audit/history, but stop attaching one shared decision
-- to every car belonging to the same participant and stage.
UPDATE "Registration"
SET "participantStageInspectionId" = NULL
WHERE "participantStageInspectionId" IS NOT NULL;
