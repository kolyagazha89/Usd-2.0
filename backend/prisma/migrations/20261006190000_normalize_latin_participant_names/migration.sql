-- Normalize the known Latin spellings that have appeared in participant imports.
-- This is intentionally limited to Russian-name aliases so genuine foreign names are not
-- rewritten automatically.
UPDATE "Participant"
SET "lastName" = CASE lower(trim("lastName"))
  WHEN 'mokhov' THEN 'Мохов'
  WHEN 'kosolapov' THEN 'Косолапов'
  ELSE "lastName"
END,
"firstName" = CASE lower(trim("firstName"))
  WHEN 'vasily' THEN 'Василий'
  WHEN 'vasiliy' THEN 'Василий'
  WHEN 'vasili' THEN 'Василий'
  WHEN 'vasilii' THEN 'Василий'
  WHEN 'vassily' THEN 'Василий'
  WHEN 'wassily' THEN 'Василий'
  ELSE "firstName"
END,
"middleName" = CASE
  WHEN "middleName" IS NULL THEN NULL
  WHEN lower(trim("middleName")) IN ('vasily','vasiliy','vasili','vasilii','vassily','wassily') THEN 'Василий'
  ELSE "middleName"
END
WHERE lower(trim("lastName")) IN ('mokhov','kosolapov')
   OR lower(trim("firstName")) IN ('vasily','vasiliy','vasili','vasilii','vassily','wassily')
   OR lower(trim(COALESCE("middleName", ''))) IN ('vasily','vasiliy','vasili','vasilii','vassily','wassily');
