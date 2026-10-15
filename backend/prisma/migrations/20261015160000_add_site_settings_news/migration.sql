ALTER TABLE "SiteSettings"
ADD COLUMN "news" JSONB NOT NULL DEFAULT '[]'::jsonb;
