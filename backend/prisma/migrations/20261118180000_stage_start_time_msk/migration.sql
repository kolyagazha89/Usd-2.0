-- Nullable additive field: existing and historical stages use the public 10:00 MSK default.
ALTER TABLE "Stage" ADD COLUMN "startTimeMsk" TEXT;
