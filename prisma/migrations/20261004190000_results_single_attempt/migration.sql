ALTER TABLE "Result"
  DROP INDEX IF EXISTS "Result_registrationClassId_attemptNumber_key";

ALTER TABLE "Result"
  DROP COLUMN IF EXISTS "attemptNumber";

ALTER TABLE "Result"
  ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "Result_createdByUserId_idx" ON "Result"("createdByUserId");

ALTER TABLE "Result"
  ADD CONSTRAINT "Result_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
