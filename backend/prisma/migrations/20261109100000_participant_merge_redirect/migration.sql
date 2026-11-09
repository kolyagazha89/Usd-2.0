-- Lossless alias; old Participant row, archived IDs, original USD token and
-- historical references stay in the database. No existing rows are modified.
CREATE TABLE "ParticipantMergeRedirect" (
  "sourceId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "mergedByUserId" TEXT NOT NULL,
  "mergedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recovery" JSONB NOT NULL,
  CONSTRAINT "ParticipantMergeRedirect_pkey" PRIMARY KEY ("sourceId")
);

CREATE INDEX "ParticipantMergeRedirect_targetId_idx" ON "ParticipantMergeRedirect"("targetId");
CREATE INDEX "ParticipantMergeRedirect_mergedAt_idx" ON "ParticipantMergeRedirect"("mergedAt");

ALTER TABLE "ParticipantMergeRedirect" ADD CONSTRAINT "ParticipantMergeRedirect_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParticipantMergeRedirect" ADD CONSTRAINT "ParticipantMergeRedirect_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParticipantMergeRedirect" ADD CONSTRAINT "ParticipantMergeRedirect_mergedByUserId_fkey"
  FOREIGN KEY ("mergedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
