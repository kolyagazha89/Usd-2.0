-- Preserve all existing posts. Only newly attached image keys are stored here.
ALTER TABLE "TeamPost" ADD COLUMN "images" JSONB;
