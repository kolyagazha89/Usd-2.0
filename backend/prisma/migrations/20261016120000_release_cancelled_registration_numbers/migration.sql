-- Release sticker numbers left behind by older cancelled registrations,
-- while preserving class/number links that still have historical results.
DELETE FROM "RegistrationClass" rc
USING "Registration" r
WHERE rc."registrationId" = r."id"
  AND r."status" = 'CANCELLED'
  AND NOT EXISTS (
    SELECT 1 FROM "Result" result
    WHERE result."registrationClassId" = rc."id"
  );

DELETE FROM "RegistrationNumber" rn
USING "Registration" r
WHERE rn."registrationId" = r."id"
  AND r."status" = 'CANCELLED'
  AND NOT EXISTS (
    SELECT 1 FROM "RegistrationClass" rc
    WHERE rc."numberId" = rn."id"
  );

-- Cancelled registrations retain their audit row but no longer reserve
-- participant/sticker numbers. Only active registrations must be unique.
DROP INDEX IF EXISTS "Registration_stageId_participantNumber_key";

CREATE UNIQUE INDEX "Registration_stageId_participantNumber_active_key"
ON "Registration"("stageId", "participantNumber")
WHERE "status" = 'ACTIVE';
