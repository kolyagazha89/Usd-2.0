-- =========================================================
-- USD 2.0
-- Migration: CarConfiguration -> Configuration + Versions
-- =========================================================

BEGIN;

-- =========================================================
-- 1. Rename the existing configuration table.
--
-- Existing rows become configuration versions.
-- Their IDs are preserved.
-- =========================================================

ALTER TABLE "CarConfiguration"
RENAME TO "CarConfigurationVersion";

ALTER TABLE "CarConfigurationVersion"
RENAME CONSTRAINT "CarConfiguration_pkey"
TO "CarConfigurationVersion_pkey";
-- =========================================================
-- 2. Rename child foreign-key columns:
--
-- configurationId -> versionId
-- =========================================================

ALTER TABLE "CarHeadUnit"
RENAME COLUMN "configurationId" TO "versionId";

ALTER TABLE "CarAudioComponent"
RENAME COLUMN "configurationId" TO "versionId";

ALTER TABLE "CarAmplifier"
RENAME COLUMN "configurationId" TO "versionId";

ALTER TABLE "CarBattery"
RENAME COLUMN "configurationId" TO "versionId";

ALTER TABLE "CarGenerator"
RENAME COLUMN "configurationId" TO "versionId";


-- =========================================================
-- 3. Add configurationId to the former configuration table.
--
-- Initially nullable because we need to create logical
-- configurations and then connect every old version to one.
-- =========================================================

ALTER TABLE "CarConfigurationVersion"
ADD COLUMN "configurationId" TEXT;


-- =========================================================
-- 4. Create the new logical CarConfiguration table.
-- =========================================================

CREATE TABLE "CarConfiguration" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CarConfiguration_pkey" PRIMARY KEY ("id")
);


-- =========================================================
-- 5. Create one logical "РћСЃРЅРѕРІРЅР°СЏ" configuration for every
-- existing car that has at least one old configuration.
--
-- Existing data did not have configuration names, so there
-- is no information allowing us to distinguish old rows as
-- "SPL", "РџРѕРІСЃРµРґРЅРµРІРЅР°СЏ", etc.
--
-- Therefore all existing versions for one car are placed
-- into one configuration called "РћСЃРЅРѕРІРЅР°СЏ".
-- =========================================================

INSERT INTO "CarConfiguration" (
    "id",
    "carId",
    "name",
    "currentVersion",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    "carId",
    'РћСЃРЅРѕРІРЅР°СЏ',
    MAX("version"),
    MIN("createdAt"),
    MAX("createdAt")
FROM "CarConfigurationVersion"
GROUP BY "carId";


-- =========================================================
-- 6. Connect every existing version to its new logical
-- configuration.
-- =========================================================

UPDATE "CarConfigurationVersion" AS version
SET "configurationId" = configuration."id"
FROM "CarConfiguration" AS configuration
WHERE configuration."carId" = version."carId";


-- =========================================================
-- 7. configurationId is now populated and becomes required.
-- =========================================================

ALTER TABLE "CarConfigurationVersion"
ALTER COLUMN "configurationId" SET NOT NULL;


-- =========================================================
-- 8. The old table used carId directly.
-- It is no longer needed because the relationship is now:
--
-- Car
--   -> CarConfiguration
--       -> CarConfigurationVersion
-- =========================================================

ALTER TABLE "CarConfigurationVersion"
DROP COLUMN "carId";


-- =========================================================
-- 9. Add new logical configuration foreign key.
-- =========================================================

ALTER TABLE "CarConfiguration"
ADD CONSTRAINT "CarConfiguration_carId_fkey"
FOREIGN KEY ("carId")
REFERENCES "Car"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


-- =========================================================
-- 10. Remove the old foreign key from the renamed version
-- table and create the new configuration relation.
-- =========================================================

ALTER TABLE "CarConfigurationVersion"
DROP CONSTRAINT IF EXISTS "CarConfiguration_carId_fkey";

ALTER TABLE "CarConfigurationVersion"
ADD CONSTRAINT "CarConfigurationVersion_configurationId_fkey"
FOREIGN KEY ("configurationId")
REFERENCES "CarConfiguration"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


-- =========================================================
-- 11. Rename old indexes/constraints where necessary.
-- =========================================================

DROP INDEX IF EXISTS "CarConfiguration_carId_version_key";

DROP INDEX IF EXISTS "CarConfiguration_carId_idx";

DROP INDEX IF EXISTS "CarConfiguration_createdAt_idx";


-- =========================================================
-- 12. New indexes for logical configurations.
-- =========================================================

CREATE INDEX "CarConfiguration_carId_idx"
ON "CarConfiguration"("carId");

CREATE INDEX "CarConfiguration_carId_name_idx"
ON "CarConfiguration"("carId", "name");


-- =========================================================
-- 13. Version uniqueness:
--
-- One configuration cannot have two versions with the same
-- version number.
-- =========================================================

CREATE UNIQUE INDEX "CarConfigurationVersion_configurationId_version_key"
ON "CarConfigurationVersion"("configurationId", "version");

CREATE INDEX "CarConfigurationVersion_configurationId_idx"
ON "CarConfigurationVersion"("configurationId");

CREATE INDEX "CarConfigurationVersion_createdAt_idx"
ON "CarConfigurationVersion"("createdAt");


-- =========================================================
-- 14. Rename existing child indexes.
--
-- PostgreSQL keeps index names when a column is renamed.
-- Therefore the old indexes still exist, but now index
-- the renamed versionId columns.
-- =========================================================

ALTER INDEX IF EXISTS "CarHeadUnit_configurationId_idx"
RENAME TO "CarHeadUnit_versionId_idx";

ALTER INDEX IF EXISTS "CarAudioComponent_configurationId_idx"
RENAME TO "CarAudioComponent_versionId_idx";

ALTER INDEX IF EXISTS "CarAmplifier_configurationId_idx"
RENAME TO "CarAmplifier_versionId_idx";

ALTER INDEX IF EXISTS "CarBattery_configurationId_idx"
RENAME TO "CarBattery_versionId_idx";

ALTER INDEX IF EXISTS "CarGenerator_configurationId_idx"
RENAME TO "CarGenerator_versionId_idx";


-- =========================================================
-- 15. Amplifier -> component connection quantity.
--
-- This is different from AudioComponent.quantity.
-- =========================================================

ALTER TABLE "CarAmplifierComponent"
ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;


-- =========================================================
-- 16. Foreign keys for renamed child columns.
--
-- The existing FK constraints were automatically updated by
-- PostgreSQL when the column/table was renamed, but we
-- explicitly recreate them with the new semantic names.
-- =========================================================

ALTER TABLE "CarHeadUnit"
DROP CONSTRAINT IF EXISTS "CarHeadUnit_configurationId_fkey";

ALTER TABLE "CarHeadUnit"
ADD CONSTRAINT "CarHeadUnit_versionId_fkey"
FOREIGN KEY ("versionId")
REFERENCES "CarConfigurationVersion"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE "CarAudioComponent"
DROP CONSTRAINT IF EXISTS "CarAudioComponent_configurationId_fkey";

ALTER TABLE "CarAudioComponent"
ADD CONSTRAINT "CarAudioComponent_versionId_fkey"
FOREIGN KEY ("versionId")
REFERENCES "CarConfigurationVersion"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE "CarAmplifier"
DROP CONSTRAINT IF EXISTS "CarAmplifier_configurationId_fkey";

ALTER TABLE "CarAmplifier"
ADD CONSTRAINT "CarAmplifier_versionId_fkey"
FOREIGN KEY ("versionId")
REFERENCES "CarConfigurationVersion"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE "CarBattery"
DROP CONSTRAINT IF EXISTS "CarBattery_configurationId_fkey";

ALTER TABLE "CarBattery"
ADD CONSTRAINT "CarBattery_versionId_fkey"
FOREIGN KEY ("versionId")
REFERENCES "CarConfigurationVersion"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE "CarGenerator"
DROP CONSTRAINT IF EXISTS "CarGenerator_configurationId_fkey";

ALTER TABLE "CarGenerator"
ADD CONSTRAINT "CarGenerator_versionId_fkey"
FOREIGN KEY ("versionId")
REFERENCES "CarConfigurationVersion"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


COMMIT;