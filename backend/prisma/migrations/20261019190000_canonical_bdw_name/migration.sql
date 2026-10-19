-- Display names only: preserve IDs, class codes, registrations and results.
UPDATE "Direction" SET "name" = 'BDW'
WHERE regexp_replace(upper("name"), '[[:space:]_-]+', '', 'g') = 'BDWSPL';
UPDATE "Class" SET "name" = regexp_replace("name", '^BDW[[:space:]_-]*SPL', 'BDW', 'i')
WHERE "name" ~* '^BDW[[:space:]_-]*SPL($|[[:space:]_-])';
UPDATE "StageClass" SET "customName" = regexp_replace("customName", '^BDW[[:space:]_-]*SPL', 'BDW', 'i')
WHERE "customName" ~* '^BDW[[:space:]_-]*SPL($|[[:space:]_-])';
