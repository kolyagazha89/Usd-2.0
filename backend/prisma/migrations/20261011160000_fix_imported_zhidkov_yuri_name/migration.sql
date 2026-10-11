-- Correct a confirmed historical-import name corruption without merging participants
-- or changing any registration/result relationships.
-- Scope is limited to participants attached to imported registrations.
UPDATE "Participant" p
SET "firstName" = 'Юрий'
WHERE lower(regexp_replace(btrim(p."lastName"), '[[:space:]]+', ' ', 'g')) = 'жидков'
  AND lower(regexp_replace(btrim(p."firstName"), '[[:space:]]+', ' ', 'g')) IN (
    'йры',
    'йри',
    'йрий',
    'йури',
    'yuri',
    'yury',
    'yuriy',
    'yurii'
  )
  AND EXISTS (
    SELECT 1
    FROM "Registration" r
    WHERE r."participantId" = p.id
      AND r.source = 'IMPORT'
  );
