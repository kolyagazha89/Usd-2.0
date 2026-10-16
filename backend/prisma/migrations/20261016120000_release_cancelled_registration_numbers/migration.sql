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

-- Preserve Prisma's composite unique constraint while allowing sticker-number reuse.
-- Cancelled registrations keep their audit row, but move to a unique negative
-- archival number that is never allocated as a sticker number.
WITH cancelled AS (
  SELECT
    r."id",
    LEAST(COALESCE(stage_min.min_number, 0), 0)
      - ROW_NUMBER() OVER (PARTITION BY r."stageId" ORDER BY r."registeredAt", r."id") AS archival_number
  FROM "Registration" r
  JOIN (
    SELECT "stageId", MIN("participantNumber") AS min_number
    FROM "Registration"
    GROUP BY "stageId"
  ) stage_min ON stage_min."stageId" = r."stageId"
  WHERE r."status" = 'CANCELLED'
)
UPDATE "Registration" r
SET "participantNumber" = cancelled.archival_number
FROM cancelled
WHERE r."id" = cancelled."id";
