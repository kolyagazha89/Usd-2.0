-- Normalize only records touched by historical/import registrations.
-- Keep participant identity and result/registration links intact; do not auto-merge people.
UPDATE "Participant" p
SET
  "lastName" = regexp_replace(btrim(p."lastName"), '[[:space:]]+', ' ', 'g'),
  "firstName" = regexp_replace(btrim(p."firstName"), '[[:space:]]+', ' ', 'g'),
  "middleName" = CASE
    WHEN p."middleName" IS NULL OR btrim(p."middleName") = '' THEN NULL
    ELSE regexp_replace(btrim(p."middleName"), '[[:space:]]+', ' ', 'g')
  END,
  "team" = CASE
    WHEN p."team" IS NULL OR btrim(p."team") = '' THEN NULL
    ELSE regexp_replace(btrim(p."team"), '[[:space:]]+', ' ', 'g')
  END
WHERE EXISTS (
  SELECT 1
  FROM "Registration" r
  WHERE r."participantId" = p.id
    AND r.source = 'IMPORT'
);

-- A real model such as "ВАЗ 2112" should be displayed without a fake brand
-- prefix ("Не указано"). Cars that truly have no model get one consistent label.
UPDATE "Car" c
SET
  "brand" = CASE
    WHEN lower(btrim(c."brand")) IN ('неизвестно', 'не указано', 'импорт', 'unknown', '') THEN 'Не указано'
    ELSE regexp_replace(btrim(c."brand"), '[[:space:]]+', ' ', 'g')
  END,
  "model" = CASE
    WHEN lower(btrim(c."model")) IN ('автомобиль не указан', 'не указано', 'неизвестно', 'unknown', '') THEN 'Не указано'
    ELSE regexp_replace(btrim(c."model"), '[[:space:]]+', ' ', 'g')
  END
WHERE EXISTS (
  SELECT 1
  FROM "Registration" r
  WHERE r."carId" = c.id
    AND r.source = 'IMPORT'
);
