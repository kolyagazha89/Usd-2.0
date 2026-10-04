/*
  Warnings:

  - A unique constraint covering the columns `[stageId,carId]` on the table `Registration` will be added.
  - Made the column `carId` on table `Registration` required.
*/

-- =========================================================
-- 1. Remove old participant-per-stage uniqueness.
--
-- One participant may have multiple cars on the same stage.
-- =========================================================

DROP INDEX "Registration_stageId_participantId_key";


-- =========================================================
-- 2. Restore car references for legacy IMPORT registrations.
--
-- Shadow database contains no application data, therefore
-- these cars are created only when the corresponding
-- participants actually exist.
-- =========================================================

DO $$
BEGIN

    IF EXISTS (
        SELECT 1
        FROM "Participant"
        WHERE "id" = '663e7f51-1e23-4ff1-80cd-9169b410a8eb'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM "Car"
        WHERE "legacyId" = 'LEGACY-IMPORT-CAR-77'
    )
    THEN

        INSERT INTO "Car" (
            "id",
            "participantId",
            "brand",
            "model",
            "photoUrl",
            "isActive",
            "legacyId",
            "createdAt",
            "updatedAt",
            "registrationNumber",
            "registrationCountry",
            "color",
            "isPublic"
        )
        VALUES (
            gen_random_uuid()::text,
            '663e7f51-1e23-4ff1-80cd-9169b410a8eb',
            'Историческая запись',
            'Автомобиль из старого импорта',
            NULL,
            false,
            'LEGACY-IMPORT-CAR-77',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            'IMPORT-77',
            'RU',
            NULL,
            false
        );

    END IF;


    IF EXISTS (
        SELECT 1
        FROM "Participant"
        WHERE "id" = '6495d230-2647-4b71-a1eb-dc833d7ffd3a'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM "Car"
        WHERE "legacyId" = 'LEGACY-IMPORT-CAR-88'
    )
    THEN

        INSERT INTO "Car" (
            "id",
            "participantId",
            "brand",
            "model",
            "photoUrl",
            "isActive",
            "legacyId",
            "createdAt",
            "updatedAt",
            "registrationNumber",
            "registrationCountry",
            "color",
            "isPublic"
        )
        VALUES (
            gen_random_uuid()::text,
            '6495d230-2647-4b71-a1eb-dc833d7ffd3a',
            'Историческая запись',
            'Автомобиль из старого импорта',
            NULL,
            false,
            'LEGACY-IMPORT-CAR-88',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            'IMPORT-88',
            'RU',
            NULL,
            false
        );

    END IF;

END $$;
-- =========================================================
-- 3. Connect the historical registrations to the technical
-- cars created above.
-- =========================================================

UPDATE "Registration" AS registration
SET "carId" = car."id"
FROM "Car" AS car
WHERE
    registration."carId" IS NULL
    AND registration."source" = 'IMPORT'
    AND registration."participantId" = car."participantId"
    AND (
        (
            registration."participantNumber" = 77
            AND car."legacyId" = 'LEGACY-IMPORT-CAR-77'
        )
        OR
        (
            registration."participantNumber" = 88
            AND car."legacyId" = 'LEGACY-IMPORT-CAR-88'
        )
    );


-- =========================================================
-- 4. Safety check.
--
-- There must be no registrations without a car left.
-- If there are, abort the migration instead of silently
-- corrupting or losing data.
-- =========================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Registration"
        WHERE "carId" IS NULL
    ) THEN
        RAISE EXCEPTION
            'Migration aborted: Registration rows with NULL carId still exist';
    END IF;
END $$;


-- =========================================================
-- 5. carId is now required.
-- =========================================================

ALTER TABLE "Registration"
ALTER COLUMN "carId" SET NOT NULL;


-- =========================================================
-- 6. One car can have only one registration on a stage.
-- =========================================================

CREATE UNIQUE INDEX "Registration_stageId_carId_key"
ON "Registration"("stageId", "carId");


-- =========================================================
-- 7. Restore the foreign key.
-- =========================================================

ALTER TABLE "Registration"
DROP CONSTRAINT "Registration_carId_fkey";

ALTER TABLE "Registration"
ADD CONSTRAINT "Registration_carId_fkey"
FOREIGN KEY ("carId")
REFERENCES "Car"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;