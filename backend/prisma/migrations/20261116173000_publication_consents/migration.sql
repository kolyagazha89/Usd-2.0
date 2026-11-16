-- Optional publication permissions have no implied or migrated grants.
CREATE TABLE "ParticipantPublicationConsent" (
    "participantId" TEXT NOT NULL,
    "fullName" BOOLEAN NOT NULL DEFAULT false,
    "city" BOOLEAN NOT NULL DEFAULT false,
    "team" BOOLEAN NOT NULL DEFAULT false,
    "results" BOOLEAN NOT NULL DEFAULT false,
    "car" BOOLEAN NOT NULL DEFAULT false,
    "profilePhoto" BOOLEAN NOT NULL DEFAULT false,
    "carPhoto" BOOLEAN NOT NULL DEFAULT false,
    "eventImage" BOOLEAN NOT NULL DEFAULT false,
    "promotionalImage" BOOLEAN NOT NULL DEFAULT false,
    "textVersion" VARCHAR(40) NOT NULL,
    "affirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ParticipantPublicationConsent_pkey" PRIMARY KEY ("participantId")
);
ALTER TABLE "ParticipantPublicationConsent"
  ADD CONSTRAINT "ParticipantPublicationConsent_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "Participant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Legacy publicly visible profiles/cars have no proof of Article 10.1 consent.
-- Retain all private records and sporting results; never presume publication.
UPDATE "Participant" SET "isPublic" = false WHERE "isPublic" = true;
UPDATE "Car" SET "isPublic" = false WHERE "isPublic" = true;

ALTER TABLE "Participant" ALTER COLUMN "isPublic" SET DEFAULT false;
ALTER TABLE "Car" ALTER COLUMN "isPublic" SET DEFAULT false;
