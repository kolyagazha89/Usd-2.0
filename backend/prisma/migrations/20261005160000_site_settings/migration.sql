CREATE TABLE IF NOT EXISTS "SiteSettings" (
  "id" TEXT NOT NULL,
  "branding" JSONB NOT NULL,
  "homepage" JSONB NOT NULL,
  "stream" JSONB NOT NULL,
  "liveResults" JSONB NOT NULL,
  "navigation" JSONB NOT NULL,
  "contacts" JSONB NOT NULL,
  "social" JSONB NOT NULL,
  "seo" JSONB NOT NULL,
  "legal" JSONB NOT NULL,
  "footer" JSONB NOT NULL,
  "registration" JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);