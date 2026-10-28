-- Additive, nullable catalog references: no destructive backfill of historical equipment.
-- Opaque catalog IDs (UUIDs or curated slugs) reference the CMS catalog (currently JSON), not a foreign-key table.
-- Existing imported/registered configurations remain readable and unchanged.
ALTER TABLE "CarHeadUnit" ADD COLUMN "catalogEntryId" TEXT;
ALTER TABLE "CarAudioComponent" ADD COLUMN "catalogEntryId" TEXT;
ALTER TABLE "CarAmplifier" ADD COLUMN "catalogEntryId" TEXT;
