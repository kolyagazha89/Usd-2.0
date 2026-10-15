-- Cancelled registrations are retained for audit, but must not block a new active entry
-- for the same car on the same stage.
ALTER TABLE "Registration" DROP CONSTRAINT IF EXISTS "Registration_stageId_carId_key";
DROP INDEX IF EXISTS "Registration_stageId_carId_key";
CREATE INDEX IF NOT EXISTS "Registration_stageId_carId_idx"
  ON "Registration"("stageId", "carId");
