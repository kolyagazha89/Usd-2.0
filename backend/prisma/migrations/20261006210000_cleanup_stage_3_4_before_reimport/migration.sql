-- Repeatable safety cleanup for the two historical import stages.
-- Keeps the Stage records themselves so they can be imported again.
-- Deletes only stage-specific registrations/results/import jobs and
-- participant/car identities that are not referenced anywhere else.

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

DELETE FROM "Record"
WHERE "resultId" IN (SELECT id FROM _usd_cleanup_results)
   OR "stageId" IN (SELECT id FROM _usd_cleanup_stage_ids);

DELETE FROM "ImportJob"
WHERE "stageId" IN (SELECT id FROM _usd_cleanup_stage_ids);

DELETE FROM "Registration"
WHERE id IN (SELECT id FROM _usd_cleanup_registrations);

DELETE FROM "Car" c
WHERE c.id IN (SELECT id FROM _usd_cleanup_cars)
  AND NOT EXISTS (
    SELECT 1 FROM "Registration" r WHERE r."carId" = c.id
  );

DELETE FROM "_ParticipantLegacyEmail" e
WHERE e."participantId" IN (
  SELECT p.id
  FROM "Participant" p
  WHERE p.id IN (SELECT id FROM _usd_cleanup_participants)
    AND NOT EXISTS (SELECT 1 FROM "Registration" r WHERE r."participantId" = p.id)
    AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."participantId" = p.id)
    AND NOT EXISTS (SELECT 1 FROM "Disqualification" d WHERE d."participantId" = p.id)
    AND NOT EXISTS (SELECT 1 FROM "Car" c WHERE c."participantId" = p.id)
);

DELETE FROM "Participant" p
WHERE p.id IN (SELECT id FROM _usd_cleanup_participants)
  AND NOT EXISTS (SELECT 1 FROM "Registration" r WHERE r."participantId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."participantId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "Disqualification" d WHERE d."participantId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "Car" c WHERE c."participantId" = p.id);

COMMIT;