-- BassRace multi-number registration support.
-- One Registration remains the participant/car entry for a stage.
-- RegistrationNumber reserves every number assigned to that entry.
-- RegistrationClass points to the number used for that specific class.

CREATE TABLE "RegistrationNumber" (
  "id" TEXT NOT NULL,
  "stageId" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RegistrationNumber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationNumber_stageId_number_key"
  ON "RegistrationNumber"("stageId", "number");

CREATE INDEX "RegistrationNumber_registrationId_idx"
  ON "RegistrationNumber"("registrationId");

CREATE INDEX "RegistrationNumber_number_idx"
  ON "RegistrationNumber"("number");

INSERT INTO "RegistrationNumber" ("id", "stageId", "registrationId", "number", "isPrimary")
SELECT
  md5(r."id" || ':primary')::text,
  r."stageId",
  r."id",
  r."participantNumber",
  true
FROM "Registration" r;

ALTER TABLE "RegistrationNumber"
  ADD CONSTRAINT "RegistrationNumber_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "Stage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RegistrationNumber"
  ADD CONSTRAINT "RegistrationNumber_registrationId_fkey"
  FOREIGN KEY ("registrationId") REFERENCES "Registration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RegistrationClass"
  ADD COLUMN "numberId" TEXT;

UPDATE "RegistrationClass" rc
SET "numberId" = rn."id"
FROM "RegistrationNumber" rn
WHERE rn."registrationId" = rc."registrationId"
  AND rn."isPrimary" = true;

ALTER TABLE "RegistrationClass"
  ALTER COLUMN "numberId" SET NOT NULL;

ALTER TABLE "RegistrationClass"
  ADD CONSTRAINT "RegistrationClass_numberId_fkey"
  FOREIGN KEY ("numberId") REFERENCES "RegistrationNumber"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "RegistrationClass_numberId_idx"
  ON "RegistrationClass"("numberId");
