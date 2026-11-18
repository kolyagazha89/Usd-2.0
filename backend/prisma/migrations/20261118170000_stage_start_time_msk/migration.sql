-- Stage.date remains a calendar day; startTimeMsk provides a separate
-- Moscow-clock countdown target. Existing stages default to 10:00 MSK.
ALTER TABLE "Stage" ADD COLUMN "startTimeMsk" TEXT NOT NULL DEFAULT '10:00';
