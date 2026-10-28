-- A nullable, opaque profile locator preserves every historical participant.
-- Existing registration QR codes and registrations remain untouched.
ALTER TABLE "Participant" ADD COLUMN "usdIdToken" VARCHAR(64);
CREATE UNIQUE INDEX "Participant_usdIdToken_key" ON "Participant"("usdIdToken");
