-- USD VENUE operator recovery for duplicate journal_coverage metadata.
-- Run ONLY after a verified off-device pg_dump backup of the LOCAL laptop DB.
-- Never run on the central Ubuntu database, and never delete operation_journal.
-- If any watermark differs from format_version=2 / from_sequence=0,
-- abort without modifying anything: replay coverage needs manual investigation.
BEGIN;
SET LOCAL lock_timeout = '10s';
DO $$
BEGIN
 IF current_user <> 'usd_venue_root' OR current_database() <> 'usd_venue'
  OR to_regclass('venue_private.journal_coverage') IS NULL
  OR to_regclass('venue_private.operation_journal') IS NULL THEN
  RAISE EXCEPTION 'USD VENUE: expected isolated venue root and intact journal';
 END IF;
 PERFORM pg_advisory_xact_lock(1827726190);
END $$;
LOCK TABLE venue_private.journal_coverage IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
 IF (SELECT count(*) FROM venue_private.journal_coverage) < 1 OR
  EXISTS (
   SELECT 1 FROM venue_private.journal_coverage
   WHERE format_version <> 2 OR from_sequence <> 0
  ) THEN
  RAISE EXCEPTION 'USD VENUE: divergent or missing coverage metadata; keep database unchanged';
 END IF;
END $$;
-- Keep the earliest watermark; only identical format/offset entries are removed.
WITH original AS (
 SELECT ctid FROM venue_private.journal_coverage
 ORDER BY installed_at, ctid LIMIT 1
)
DELETE FROM venue_private.journal_coverage
 WHERE ctid <> (SELECT ctid FROM original);
CREATE UNIQUE INDEX IF NOT EXISTS usd_venue_journal_coverage_singleton
 ON venue_private.journal_coverage ((true));
DO $$
BEGIN
 IF (SELECT count(*) FROM venue_private.journal_coverage) <> 1 THEN
  RAISE EXCEPTION 'USD VENUE: singleton coverage verification failed';
 END IF;
END $$;
COMMIT;
SELECT format_version, from_sequence FROM venue_private.journal_coverage;
