ALTER TABLE "Stage"
ADD COLUMN "resultsPublishedAt" TIMESTAMPTZ(3);

-- Preserve the public historical archive and already completed stages.
-- Draft/unpublished live-stage results remain private until an administrator publishes them.
UPDATE "Stage" AS stage
SET "resultsPublishedAt" = COALESCE(stage."updatedAt", CURRENT_TIMESTAMP)
WHERE stage."status" = 'COMPLETED'
   OR EXISTS (
     SELECT 1
     FROM "Registration" AS registration
     JOIN "Result" AS result ON result."registrationId" = registration."id"
     WHERE registration."stageId" = stage."id"
       AND result."isHistorical" = TRUE
   );

CREATE INDEX "Stage_resultsPublishedAt_idx" ON "Stage"("resultsPublishedAt");
