-- Persistent baseline and revision allow an ADMIN to explicitly confirm critical
-- stage mail and avoid repeat sends after an unrelated update or API restart.
ALTER TABLE "Stage"
 ADD COLUMN "criticalNoticeBaseline" JSONB,
 ADD COLUMN "criticalNoticeRevision" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "criticalNoticeState" VARCHAR(16) NOT NULL DEFAULT 'IDLE',
 ADD COLUMN "criticalNoticeSentAt" TIMESTAMPTZ(3);
