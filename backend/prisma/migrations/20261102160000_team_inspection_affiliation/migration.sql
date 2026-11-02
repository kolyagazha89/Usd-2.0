-- Additive nullable schema only. Existing historical records remain unattributed.
ALTER TABLE "Registration" ADD COLUMN "teamIdAtInspection" TEXT;
ALTER TABLE "Registration" ADD COLUMN "teamNameAtInspection" VARCHAR(120);
ALTER TABLE "Registration" ADD COLUMN "teamAffiliationCapturedAt" TIMESTAMPTZ(3);
