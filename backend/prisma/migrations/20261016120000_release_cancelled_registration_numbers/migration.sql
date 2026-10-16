-- Cancelled registrations retain their audit row but no longer reserve
-- participant/sticker numbers. Only active registrations must be unique.
DROP INDEX IF EXISTS "Registration_stageId_participantNumber_key";

CREATE UNIQUE INDEX "Registration_stageId_participantNumber_active_key"
ON "Registration"("stageId", "participantNumber")
WHERE "status" = 'ACTIVE';
