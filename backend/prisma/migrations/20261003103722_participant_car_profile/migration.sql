/*
  Safe migration:
  Participant:
    fullName -> lastName / firstName / middleName
    email is preserved in legacy table

  Car:
    plateNumber -> registrationNumber

  Existing car receives CarConfiguration v1.
*/

-- =========================================================
-- 1. Create new enums
-- =========================================================

CREATE TYPE "CarDirection" AS ENUM ('FRONT', 'REAR', 'SUB');

CREATE TYPE "AudioComponentType" AS ENUM (
    'SUBWOOFER',
    'MIDBASS',
    'MIDRANGE',
    'HORN',
    'OTHER'
);

-- =========================================================
-- 2. Preserve old participant emails
-- =========================================================

CREATE TABLE "_ParticipantLegacyEmail" (
    "participantId" TEXT NOT NULL,
    "email" TEXT,

    CONSTRAINT "_ParticipantLegacyEmail_pkey"
        PRIMARY KEY ("participantId")
);

INSERT INTO "_ParticipantLegacyEmail" ("participantId", "email")
SELECT "id", "email"
FROM "Participant"
WHERE "email" IS NOT NULL;

-- =========================================================
-- 3. Add new Participant fields as nullable temporarily
-- =========================================================

ALTER TABLE "Participant"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "middleName" TEXT;

-- =========================================================
-- 4. Transfer existing FIO
-- =========================================================

UPDATE "Participant"
SET
    "lastName" = split_part(trim("fullName"), ' ', 1),
    "firstName" = split_part(trim("fullName"), ' ', 2),
    "middleName" = NULLIF(
        regexp_replace(
            trim("fullName"),
            '^\S+\s+\S+\s*',
            ''
        ),
        ''
    );

-- =========================================================
-- 5. Add Car registration number temporarily as nullable
-- =========================================================

ALTER TABLE "Car"
ADD COLUMN "registrationNumber" TEXT;

-- =========================================================
-- 6. Transfer existing plate numbers
-- =========================================================

UPDATE "Car"
SET "registrationNumber" = "plateNumber";

-- =========================================================
-- 7. Validate migrated required data
-- =========================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Participant"
        WHERE "lastName" IS NULL
           OR "firstName" IS NULL
           OR trim("lastName") = ''
           OR trim("firstName") = ''
    ) THEN
        RAISE EXCEPTION
            'Participant migration failed: empty firstName or lastName found';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "Car"
        WHERE "registrationNumber" IS NULL
           OR trim("registrationNumber") = ''
    ) THEN
        RAISE EXCEPTION
            'Car migration failed: empty registrationNumber found';
    END IF;
END $$;

-- =========================================================
-- 8. Make new fields required
-- =========================================================

ALTER TABLE "Participant"
ALTER COLUMN "firstName" SET NOT NULL,
ALTER COLUMN "lastName" SET NOT NULL;

ALTER TABLE "Car"
ALTER COLUMN "registrationNumber" SET NOT NULL;

-- =========================================================
-- 9. Remove old Participant fields
-- =========================================================

DROP INDEX "Participant_fullName_idx";

ALTER TABLE "Participant"
DROP COLUMN "fullName",
DROP COLUMN "email";

-- =========================================================
-- 10. Remove old Car plate field
-- =========================================================

DROP INDEX "Car_plateNumber_idx";

ALTER TABLE "Car"
DROP COLUMN "plateNumber";

-- =========================================================
-- 11. Add Car public fields
-- =========================================================

ALTER TABLE "Car"
ADD COLUMN "color" TEXT,
ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;

-- =========================================================
-- 12. Create CarConfiguration
-- =========================================================

CREATE TABLE "CarConfiguration" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "vibrationIsolation" TEXT,
    "additionalDescription" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarConfiguration_pkey"
        PRIMARY KEY ("id")
);

-- =========================================================
-- 13. Create Head Units
-- =========================================================

CREATE TABLE "CarHeadUnit" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "direction" "CarDirection" NOT NULL,

    CONSTRAINT "CarHeadUnit_pkey"
        PRIMARY KEY ("id")
);

-- =========================================================
-- 14. Create Audio Components
-- =========================================================

CREATE TABLE "CarAudioComponent" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "type" "AudioComponentType" NOT NULL,
    "direction" "CarDirection" NOT NULL,

    CONSTRAINT "CarAudioComponent_pkey"
        PRIMARY KEY ("id")
);

-- =========================================================
-- 15. Create Amplifiers
-- =========================================================

CREATE TABLE "CarAmplifier" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "direction" "CarDirection" NOT NULL,

    CONSTRAINT "CarAmplifier_pkey"
        PRIMARY KEY ("id")
);

-- =========================================================
-- 16. Amplifier -> Audio Component links
-- =========================================================

CREATE TABLE "CarAmplifierComponent" (
    "amplifierId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,

    CONSTRAINT "CarAmplifierComponent_pkey"
        PRIMARY KEY ("amplifierId", "componentId")
);

-- =========================================================
-- 17. Batteries
-- =========================================================

CREATE TABLE "CarBattery" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CarBattery_pkey"
        PRIMARY KEY ("id")
);

-- =========================================================
-- 18. Generators
-- =========================================================

CREATE TABLE "CarGenerator" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CarGenerator_pkey"
        PRIMARY KEY ("id")
);

-- =========================================================
-- 19. Create v1 for every existing car
-- =========================================================

INSERT INTO "CarConfiguration" (
    "id",
    "carId",
    "version"
)
SELECT
    gen_random_uuid()::text,
    "id",
    1
FROM "Car";

-- =========================================================
-- 20. Indexes
-- =========================================================

CREATE INDEX "Car_registrationNumber_idx"
    ON "Car"("registrationNumber");

CREATE INDEX "Car_isPublic_idx"
    ON "Car"("isPublic");

CREATE INDEX "Car_isActive_idx"
    ON "Car"("isActive");

CREATE INDEX "Participant_lastName_idx"
    ON "Participant"("lastName");

CREATE INDEX "Participant_firstName_idx"
    ON "Participant"("firstName");

CREATE INDEX "CarConfiguration_carId_idx"
    ON "CarConfiguration"("carId");

CREATE INDEX "CarConfiguration_createdAt_idx"
    ON "CarConfiguration"("createdAt");

CREATE UNIQUE INDEX "CarConfiguration_carId_version_key"
    ON "CarConfiguration"("carId", "version");

CREATE INDEX "CarHeadUnit_configurationId_idx"
    ON "CarHeadUnit"("configurationId");

CREATE INDEX "CarHeadUnit_direction_idx"
    ON "CarHeadUnit"("direction");

CREATE INDEX "CarAudioComponent_configurationId_idx"
    ON "CarAudioComponent"("configurationId");

CREATE INDEX "CarAudioComponent_type_idx"
    ON "CarAudioComponent"("type");

CREATE INDEX "CarAudioComponent_direction_idx"
    ON "CarAudioComponent"("direction");

CREATE INDEX "CarAmplifier_configurationId_idx"
    ON "CarAmplifier"("configurationId");

CREATE INDEX "CarAmplifier_direction_idx"
    ON "CarAmplifier"("direction");

CREATE INDEX "CarAmplifierComponent_componentId_idx"
    ON "CarAmplifierComponent"("componentId");

CREATE INDEX "CarBattery_configurationId_idx"
    ON "CarBattery"("configurationId");

CREATE INDEX "CarGenerator_configurationId_idx"
    ON "CarGenerator"("configurationId");

-- =========================================================
-- 21. Foreign keys
-- =========================================================

ALTER TABLE "CarConfiguration"
ADD CONSTRAINT "CarConfiguration_carId_fkey"
FOREIGN KEY ("carId")
REFERENCES "Car"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "CarHeadUnit"
ADD CONSTRAINT "CarHeadUnit_configurationId_fkey"
FOREIGN KEY ("configurationId")
REFERENCES "CarConfiguration"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "CarAudioComponent"
ADD CONSTRAINT "CarAudioComponent_configurationId_fkey"
FOREIGN KEY ("configurationId")
REFERENCES "CarConfiguration"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "CarAmplifier"
ADD CONSTRAINT "CarAmplifier_configurationId_fkey"
FOREIGN KEY ("configurationId")
REFERENCES "CarConfiguration"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "CarAmplifierComponent"
ADD CONSTRAINT "CarAmplifierComponent_amplifierId_fkey"
FOREIGN KEY ("amplifierId")
REFERENCES "CarAmplifier"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "CarAmplifierComponent"
ADD CONSTRAINT "CarAmplifierComponent_componentId_fkey"
FOREIGN KEY ("componentId")
REFERENCES "CarAudioComponent"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "CarBattery"
ADD CONSTRAINT "CarBattery_configurationId_fkey"
FOREIGN KEY ("configurationId")
REFERENCES "CarConfiguration"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "CarGenerator"
ADD CONSTRAINT "CarGenerator_configurationId_fkey"
FOREIGN KEY ("configurationId")
REFERENCES "CarConfiguration"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;