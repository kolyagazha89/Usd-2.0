ALTER TABLE "RefreshSession" ADD COLUMN "familyId" TEXT;
UPDATE "RefreshSession" SET "familyId" = "id" WHERE "familyId" IS NULL;
ALTER TABLE "RefreshSession" ALTER COLUMN "familyId" SET NOT NULL;
CREATE INDEX "RefreshSession_familyId_idx" ON "RefreshSession"("familyId");
