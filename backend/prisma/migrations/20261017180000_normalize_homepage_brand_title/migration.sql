-- Replace only known legacy default homepage copy; preserve custom titles and subtitles.
UPDATE "SiteSettings"
SET "homepage" = jsonb_set(
  CASE
    WHEN COALESCE("homepage"->>'heroSubtitle', '') IN (
      '',
      'Официальный чемпионат по автозвуку',
      'Ultimate Sound Destruction — соревнования, где встречаются инженерия, громкость и характер. Следите за этапами, результатами и рекордами.'
    ) THEN jsonb_set(
      "homepage",
      '{heroSubtitle}',
      '"Официальный чемпионат по автозвуку"'::jsonb,
      true
    )
    ELSE "homepage"
  END,
  '{heroTitle}',
  '"USD"'::jsonb,
  true
), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default'
  AND COALESCE("homepage"->>'heroTitle', '') IN (
    'КОГДА ЗВУК',
    'КОГДА ЗВУК СТАНОВИТСЯ МОЩНОСТЬЮ',
    'КОГДА ЗВУК СТАНОВИТСЯ МОЩНОСТЬЮ.',
    'United Sound Derby',
    'Ultimate Sound Destruction'
  );
