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

-- Normalize only built-in email templates; user-authored templates are left untouched.
UPDATE "SiteSettings" AS s
SET "registration" = jsonb_set(
  s."registration",
  '{emailTemplates}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id' = ANY (ARRAY[
          'stage-registration-open',
          'registration-confirmed',
          'stage-reminder-3d',
          'stage-reminder-1d',
          'stage-changed',
          'stage-cancelled',
          'inspection-passed',
          'inspection-failed',
          'registration-cancelled',
          'stage-results-published',
          'new-record-set',
          'auth-email-verification',
          'auth-password-reset',
          'auth-email-change'
        ]::text[])
        THEN jsonb_set(
          jsonb_set(
            jsonb_set(
              item,
              '{subject}',
              to_jsonb(replace(COALESCE(item->>'subject', ''), 'ЮСД', 'USD')),
              true
            ),
            '{footer}',
            to_jsonb(replace(COALESCE(item->>'footer', ''), 'ЮСД', 'USD')),
            true
          ),
          '{buttonLabel}',
          to_jsonb(replace(COALESCE(item->>'buttonLabel', ''), 'ЮСД', 'USD')),
          true
        )
        ELSE item
      END
      ORDER BY ordinal
    )
    FROM jsonb_array_elements(s."registration"->'emailTemplates')
      WITH ORDINALITY AS templates(item, ordinal)
  ),
  true
)
WHERE s."id" = 'default'
  AND jsonb_typeof(s."registration"->'emailTemplates') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(s."registration"->'emailTemplates') AS templates(item)
    WHERE item->>'id' = ANY (ARRAY[
      'stage-registration-open',
      'registration-confirmed',
      'stage-reminder-3d',
      'stage-reminder-1d',
      'stage-changed',
      'stage-cancelled',
      'inspection-passed',
      'inspection-failed',
      'registration-cancelled',
      'stage-results-published',
      'new-record-set',
      'auth-email-verification',
      'auth-password-reset',
      'auth-email-change'
    ]::text[])
      AND (
        COALESCE(item->>'subject', '') LIKE '%ЮСД%'
        OR COALESCE(item->>'footer', '') LIKE '%ЮСД%'
        OR COALESCE(item->>'buttonLabel', '') LIKE '%ЮСД%'
      )
  );
