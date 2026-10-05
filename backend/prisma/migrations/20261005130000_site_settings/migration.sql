CREATE TABLE "SiteSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
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
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

ALTER TYPE "MediaTargetType" ADD VALUE 'SITE_LOGO';
ALTER TYPE "MediaTargetType" ADD VALUE 'SITE_MOBILE_LOGO';
ALTER TYPE "MediaTargetType" ADD VALUE 'SITE_FAVICON';
ALTER TYPE "MediaTargetType" ADD VALUE 'SITE_IMAGE';

INSERT INTO "SiteSettings" ("id","branding","homepage","stream","liveResults","navigation","contacts","social","seo","legal","footer","registration")
VALUES (
  'default',
  '{"siteName":"USD 2.0","logoUrl":null,"mobileLogoUrl":null,"faviconUrl":null,"organizationName":"USD Russia"}',
  '{"blocks":[{"id":"hero","enabled":true,"title":null},{"id":"next-stage","enabled":true,"title":"Ближайший этап"},{"id":"live-stream","enabled":true,"title":"Прямая трансляция"},{"id":"live-results","enabled":true,"title":"Результаты LIVE"},{"id":"latest-results","enabled":true,"title":"Последние результаты"},{"id":"records","enabled":true,"title":"Рекорды"},{"id":"participants","enabled":true,"title":"Участники"}],"heroTitle":"United Sound Derby","heroSubtitle":"Официальный чемпионат по автозвуку","showNextStage":true,"showLatestResults":true,"showRecords":true,"showParticipants":true,"showLiveStream":true,"showLiveResults":true}',
  '{"enabled":false,"provider":"YOUTUBE","url":"","embedUrl":"","title":"USD LIVE","autoShowOnStageDay":true,"showChat":false}',
  '{"enabled":true,"stageId":null,"refreshSeconds":5,"showOnlyPublished":true}',
  '{"items":[]}',
  '{}','{}','{}','{}','{}',
  '{"enabled":true,"price":2000,"additionalClassPrice":2000}'
);