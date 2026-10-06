-- One-time cleanup of the accidentally imported historical data for USD 2026 stages 3 and 4.
-- Guarded by the exact production stage IDs discovered before execution.
-- It removes only data attached to those two stages and preserves shared
-- participants/cars that are still referenced elsewhere.

BEGIN;

CREATE TEMP TABLE _usd_cleanup_stage_ids(id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _usd_cleanup_stage_ids(id) VALUES
  ('80cbf225-7ca8-4207-8645-522dcea3f8b4'),
  ('c2bc4586-100f-404b-96a6-401299a34158');

CREATE TEMP TABLE _usd_cleanup_registrations(id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _usd_cleanup_registrations(id)
SELECT r.id
FROM "Registration" r
JOIN _usd_cleanup_stage_ids s ON s.id = r."stageId";

CREATE TEMP TABLE _usd_cleanup_results(id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _usd_cleanup_results(id)
SELECT DISTINCT r.id
FROM "Result" r
JOIN _usd_cleanup_registrations tr ON tr.id = r."registrationId";

CREATE TEMP TABLE _usd_cleanup_participants(id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _usd_cleanup_participants(id)
SELECT DISTINCT r."participantId"
FROM "Registration" r
JOIN _usd_cleanup_registrations tr ON tr.id = r.id;

CREATE TEMP TABLE _usd_cleanup_cars(id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _usd_cleanup_cars(id)
SELECT DISTINCT r."carId"
FROM "Registration" r
JOIN _usd_cleanup_registrations tr ON tr.id = r.id;

-- Records reference results without cascading deletion.
DELETE FROM "Record"
WHERE "resultId" IN (SELECT id FROM _usd_cleanup_results)
   OR "stageId" IN (SELECT id FROM _usd_cleanup_stage_ids);

-- Import jobs own their ImportRows through ON DELETE CASCADE.
DELETE FROM "ImportJob"
WHERE "stageId" IN (SELECT id FROM _usd_cleanup_stage_ids);

-- Registration owns results, classes, numbers and inspections through
-- cascading relations, so deleting it removes the stage-specific graph.
DELETE FROM "Registration"
WHERE id IN (SELECT id FROM _usd_cleanup_registrations);

-- Remove cars that belonged only to these two stage registrations.
-- A shared car used by another stage is preserved.
DELETE FROM "Car" c
WHERE c.id IN (SELECT id FROM _usd_cleanup_cars)
  AND NOT EXISTS (
    SELECT 1
    FROM "Registration" r
    WHERE r."carId" = c.id
  );

-- Remove participants that belonged only to these two stages, but never
-- remove an identity that has an account, a disqualification, or another
-- car still attached to it.
DELETE FROM "_ParticipantLegacyEmail" e
WHERE e."participantId" IN (
  SELECT p.id
  FROM "Participant" p
  WHERE p.id IN (SELECT id FROM _usd_cleanup_participants)
    AND NOT EXISTS (SELECT 1 FROM "Registration" r WHERE r."participantId" = p.id)
    AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."participantId" = p.id)
    AND NOT EXISTS (SELECT 1 FROM "Disqualification" d WHERE d."participantId" = p.id)
    AND NOT EXISTS (
      SELECT 1
      FROM "Car" c
      WHERE c."participantId" = p.id
    )
);

DELETE FROM "Participant" p
WHERE p.id IN (SELECT id FROM _usd_cleanup_participants)
  AND NOT EXISTS (SELECT 1 FROM "Registration" r WHERE r."participantId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."participantId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "Disqualification" d WHERE d."participantId" = p.id)
  AND NOT EXISTS (
    SELECT 1
    FROM "Car" c
    WHERE c."participantId" = p.id
  );

COMMIT;
