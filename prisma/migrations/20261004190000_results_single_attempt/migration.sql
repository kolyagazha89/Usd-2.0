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

-- Fail safely rather than silently deleting historical measurements.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Result"
    GROUP BY "registrationClassId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one result per registration class: duplicate results exist. Resolve duplicates before applying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX "Result_registrationClassId_key"
  ON "Result"("registrationClassId");
