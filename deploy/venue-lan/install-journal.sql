-- USD VENUE EXCLUSIVE: run ONCE, after signed stage import, using root in
-- the isolated usd-venue PostgreSQL service. Never run on production Ubuntu.
-- Tamper-evident append-only operation log for eventual stage reconciliation.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
BEGIN
  IF current_user <> 'usd_venue_root' THEN
    RAISE EXCEPTION 'USD VENUE journal requires the isolated bootstrap role';
  END IF;
  IF (SELECT count(*) FROM public."Stage") <> 1 THEN
    RAISE EXCEPTION 'USD VENUE journal requires exactly one imported stage';
  END IF;
  IF to_regclass('venue_private.operation_journal') IS NOT NULL THEN
    RAISE EXCEPTION 'USD VENUE journal already installed: refuse reinitialization';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS venue_private;
REVOKE ALL ON SCHEMA venue_private FROM PUBLIC;

CREATE TABLE venue_private.operation_journal (
  sequence BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  stage_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  occurred_at TIMESTAMPTZ NOT NULL,
  previous_hash TEXT NOT NULL CHECK (length(previous_hash)=64),
  hash TEXT NOT NULL UNIQUE CHECK (length(hash)=64),
  payload JSONB NOT NULL
);
REVOKE ALL ON venue_private.operation_journal FROM PUBLIC;
REVOKE ALL ON SEQUENCE venue_private.operation_journal_sequence_seq FROM PUBLIC;
GRANT USAGE ON SCHEMA venue_private TO usd_venue;
GRANT SELECT ON venue_private.operation_journal TO usd_venue;

-- A SECURITY DEFINER trigger is needed because the API cannot insert,
-- update, delete, truncate or reset the trusted journal table directly.
-- A fixed search_path prevents object-shadowing privilege escalation.
CREATE FUNCTION venue_private.capture_change() RETURNS TRIGGER
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
REVOKE ALL ON FUNCTION venue_private.capture_change() FROM PUBLIC;

-- Freeze identity of the single venue stage. Local status updates are still
-- logged by the AFTER UPDATE trigger, but INSERT/DELETE cannot switch stages.
CREATE FUNCTION venue_private.keep_single_stage() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, venue_private AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'USD VENUE is pinned to one original stage';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION venue_private.keep_single_stage() FROM PUBLIC;
CREATE TRIGGER usd_venue_one_stage
BEFORE INSERT OR UPDATE OR DELETE ON public."Stage"
FOR EACH ROW EXECUTE FUNCTION venue_private.keep_single_stage();

-- Every domain mutation used by the competition day is recorded.
-- No User, Role, RefreshSession or secret table is ever copied into this log.
DO $$
DECLARE tab TEXT;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'Stage','Participant','Car','CarConfiguration','CarConfigurationVersion',
    'CarAmplifier','CarAudioComponent','CarBattery','CarGenerator','CarHeadUnit',
    'CarAmplifierComponent',
    'Registration','RegistrationNumber','RegistrationClass',
    'Inspection','ParticipantStageInspection','RegistrationClassInspection',
    'Result','Disqualification'
  ] LOOP
    IF to_regclass(format('public.%I',tab)) IS NULL THEN
      RAISE EXCEPTION 'USD VENUE journal table missing: %',tab;
    END IF;
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION venue_private.capture_change()',
      'usd_venue_'||lower(tab)||'_journal',tab);
  END LOOP;
END $$;
-- A root-owned coverage watermark proves the link trigger was installed
-- BEFORE the first competition-day journal event. Existing installations
-- upgraded later must not claim a complete automatic sync.
CREATE TABLE venue_private.journal_coverage (
  format_version SMALLINT NOT NULL DEFAULT 2 CHECK(format_version=2),
  from_sequence BIGINT NOT NULL CHECK(from_sequence>=0),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO venue_private.journal_coverage(from_sequence) VALUES (0);
REVOKE ALL ON venue_private.journal_coverage FROM PUBLIC;
GRANT SELECT ON venue_private.journal_coverage TO usd_venue;
COMMIT;
