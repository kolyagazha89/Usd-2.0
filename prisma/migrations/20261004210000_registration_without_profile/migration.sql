-- Registration intentionally collects only email and password.
-- Participant identity data is completed later in the participant profile.
ALTER TABLE "User"
ALTER COLUMN "name" DROP NOT NULL;
