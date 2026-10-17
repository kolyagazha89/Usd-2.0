-- Replace only known legacy default homepage copy; preserve custom titles and subtitles.
UPDATE "SiteSettings"
SET "homepage" = jsonb_set(
  jsonb_set("homepage", '{heroTitle}', '"USD"'::jsonb, true),
  '{heroSubtitle}', '"Официальный чемпионат по автозвуку"'::jsonb, true
), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default'
  AND COALESCE("homepage"->>'heroTitle', '') IN (
    'КОГДА ЗВУК',
    'КОГДА ЗВУК СТАНОВИТСЯ МОЩНОСТЬЮ',
    'КОГДА ЗВУК СТАНОВИТСЯ МОЩНОСТЬЮ.',
    'United Sound Derby',
    'Ultimate Sound Destruction'
  );
