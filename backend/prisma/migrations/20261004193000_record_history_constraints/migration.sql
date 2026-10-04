-- Preserve history while preventing duplicate record snapshots for the same result.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Record"
    WHERE "resultId" IS NOT NULL
    GROUP BY "resultId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one record history row per result: duplicate resultId values exist in Record.';
  END IF;
END $$;

CREATE UNIQUE INDEX "Record_resultId_key"
  ON "Record"("resultId");

CREATE INDEX "Record_classId_isCurrent_idx"
  ON "Record"("classId", "isCurrent");
