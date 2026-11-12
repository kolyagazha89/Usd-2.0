-- USD VENUE upgrade: attach omitted amplifier/speaker link journaling, without
-- deleting earlier immutable events or rewriting their hashes.
BEGIN;
DO $$
BEGIN
 IF current_user <> 'usd_venue_root'
  OR (SELECT count(*) FROM public."Stage") <> 1
  OR to_regclass('venue_private.operation_journal') IS NULL THEN
  RAISE EXCEPTION 'VENUE journal upgrade requires original isolated venue root';
 END IF;
 PERFORM pg_advisory_xact_lock(1827726190);
END $$;
CREATE OR REPLACE FUNCTION venue_private.capture_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, venue_private AS $$
DECLARE
  v_stage_id TEXT;
  v_row_id TEXT;
  v_link_md5 TEXT;
  v_before JSONB;
  v_after JSONB;
  v_payload JSONB;
  v_previous TEXT;
  v_hash TEXT;
  v_sequence BIGINT;
  v_occurred TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(1827726190);
  IF (SELECT count(*) FROM public."Stage") <> 1 THEN
    RAISE EXCEPTION 'USD VENUE stage count changed during local judging';
  END IF;
  SELECT id INTO STRICT v_stage_id FROM public."Stage";
  IF TG_OP = 'INSERT' THEN
    v_before:=NULL;
    v_after:=to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_before:=to_jsonb(OLD);
    v_after:=NULL;
  ELSE
    v_before:=to_jsonb(OLD);
    v_after:=to_jsonb(NEW);
  END IF;
  v_row_id:=coalesce(v_after->>'id', v_before->>'id');
  IF TG_TABLE_NAME='CarAmplifierComponent' THEN
    v_link_md5:=md5(
      coalesce(v_after->>'amplifierId',v_before->>'amplifierId') || '/' ||
      coalesce(v_after->>'componentId',v_before->>'componentId'));
    v_row_id:=(
      substr(v_link_md5,1,12)||'5'||substr(v_link_md5,14,3)||
      '8'||substr(v_link_md5,18))::uuid::text;
    IF v_before IS NOT NULL THEN
      v_before:=v_before||jsonb_build_object('id',v_row_id);
    END IF;
    IF v_after IS NOT NULL THEN
      v_after:=v_after||jsonb_build_object('id',v_row_id);
    END IF;
  END IF;
  IF v_row_id IS NULL OR length(v_row_id)>200 THEN
    RAISE EXCEPTION 'USD VENUE journal requires a stable entity identifier';
  END IF;
  SELECT coalesce(
    (SELECT hash FROM venue_private.operation_journal ORDER BY sequence DESC LIMIT 1),
    repeat('0',64)
  ) INTO v_previous;
  SELECT nextval('venue_private.operation_journal_sequence_seq')
    INTO v_sequence;
  v_occurred:=clock_timestamp();
  v_payload:=jsonb_build_object(
    'sequence',v_sequence,
    'stageId',v_stage_id,
    'table',TG_TABLE_NAME,
    'recordId',v_row_id,
    'operation',TG_OP,
    'before',v_before,
    'after',v_after,
    'recordedAt',to_char(v_occurred AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
  v_hash:=encode(digest(v_previous || v_payload::text,'sha256'),'hex');
  INSERT INTO venue_private.operation_journal
    (sequence,stage_id,table_name,row_id,operation,occurred_at,
      previous_hash,hash,payload)
    VALUES(v_sequence,v_stage_id,TG_TABLE_NAME,v_row_id,TG_OP,v_occurred,
      v_previous,v_hash,v_payload);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='usd_venue_caramplifiercomponent_journal' AND NOT tgisinternal) THEN
  CREATE TRIGGER usd_venue_caramplifiercomponent_journal
    AFTER INSERT OR UPDATE OR DELETE ON public."CarAmplifierComponent"
    FOR EACH ROW EXECUTE FUNCTION venue_private.capture_change();
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS venue_private.journal_coverage (
 format_version SMALLINT NOT NULL DEFAULT 2 CHECK(format_version=2),
 from_sequence BIGINT NOT NULL CHECK(from_sequence>=0),
 installed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A pre-existing journal may contain untracked link changes. The watermark
-- is never zeroed on re-runs and prevents a falsely complete full import.
INSERT INTO venue_private.journal_coverage(from_sequence)
SELECT coalesce(max(sequence),0) FROM venue_private.operation_journal
WHERE NOT EXISTS (SELECT 1 FROM venue_private.journal_coverage);
REVOKE ALL ON venue_private.journal_coverage FROM PUBLIC;
GRANT SELECT ON venue_private.journal_coverage TO usd_venue;
COMMIT;
