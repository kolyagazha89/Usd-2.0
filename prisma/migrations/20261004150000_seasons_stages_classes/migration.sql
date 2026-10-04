CREATE TYPE "SeasonStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "StageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "Season"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "status" "SeasonStatus" NOT NULL DEFAULT 'DRAFT';

UPDATE "Season"
SET "status" = CASE
  WHEN "isActive" = true THEN 'ACTIVE'::"SeasonStatus"
  ELSE 'ARCHIVED'::"SeasonStatus"
END;

ALTER TABLE "Stage"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "venue" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "latitude" DECIMAL(9,6),
  ADD COLUMN "longitude" DECIMAL(9,6),
  ADD COLUMN "status" "StageStatus" NOT NULL DEFAULT 'DRAFT';

UPDATE "Stage"
SET "status" = CASE
  WHEN "isDeleted" = true THEN 'CANCELLED'::"StageStatus"
  WHEN "registrationOpen" = true THEN 'PUBLISHED'::"StageStatus"
  ELSE 'DRAFT'::"StageStatus"
END;

CREATE INDEX "Stage_status_idx" ON "Stage"("status");

ALTER TABLE "Class"
  ADD COLUMN "unit" "ResultUnit" NOT NULL DEFAULT 'DB';

ALTER TABLE "StageClass"
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "participantLimit" INTEGER,
  ADD COLUMN "customName" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "settings" JSONB;

CREATE INDEX "StageClass_isActive_idx" ON "StageClass"("isActive");
