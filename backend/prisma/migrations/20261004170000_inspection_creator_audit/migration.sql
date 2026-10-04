ALTER TABLE "Inspection"
  ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "Inspection_createdByUserId_idx"
  ON "Inspection"("createdByUserId");

ALTER TABLE "Inspection"
  ADD CONSTRAINT "Inspection_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing inspections predate creator tracking; preserve them with a nullable owner.
