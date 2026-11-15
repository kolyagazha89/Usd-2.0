-- USD LAN: upgrade the original single-stage append-only journal to a
-- same-PostgreSQL multi-stage history without rewriting any old journal hashes.
-- Run as the isolated local PostgreSQL root, AFTER amplifier-link migration.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SELECT pg_advisory_xact_lock(1827726190);
DO $preflight$
DECLARE existing_count bigint;
BEGIN
 IF session_user <> 'usd_venue_root' OR current_user <> 'usd_venue_root' THEN
  RAISE EXCEPTION 'USD season migration requires local root session';
 END IF;
 IF to_regclass('venue_private.operation_journal') IS NULL THEN
  RAISE EXCEPTION 'USD season migration requires existing immutable journal';
 END IF;
 SELECT count(*) INTO existing_count FROM public."Stage";
 IF existing_count < 1 THEN RAISE EXCEPTION 'No trusted stage imported'; END IF;
END $preflight$;
CREATE TABLE IF NOT EXISTS venue_private.active_stage(
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
 stage_id TEXT NOT NULL REFERENCES public."Stage"(id) ON DELETE RESTRICT,
 changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON venue_private.active_stage FROM PUBLIC;
GRANT SELECT ON venue_private.active_stage TO usd_venue;
INSERT INTO venue_private.active_stage(singleton,stage_id)
 SELECT TRUE,id FROM public."Stage"
 WHERE (SELECT count(*) FROM public."Stage")=1
 ON CONFLICT(singleton) DO NOTHING;
DO $check$
BEGIN
 IF (SELECT count(*) FROM venue_private.active_stage)<>1
  OR NOT EXISTS(
    SELECT 1 FROM venue_private.active_stage a JOIN public."Stage" s ON s.id=a.stage_id
  ) THEN
  RAISE EXCEPTION 'Active stage missing or inconsistent';
 END IF;
END $check$;
CREATE OR REPLACE FUNCTION venue_private.capture_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, venue_private AS $journal$
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
 -- The signed baseline importer is a one-shot root session, NEVER the API
 -- account. Skipping baseline INSERTs prevents replaying central records.
 PERFORM pg_advisory_xact_lock(1827726190);
 IF session_user='usd_venue_root'
  AND current_setting('usd_venue.signed_import',true)='on' THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;
 SELECT stage_id INTO STRICT v_stage_id FROM venue_private.active_stage;
 IF TG_OP='INSERT' THEN
  v_before:=NULL;v_after:=to_jsonb(NEW);
 ELSIF TG_OP='DELETE' THEN
  v_before:=to_jsonb(OLD);v_after:=NULL;
 ELSE
  v_before:=to_jsonb(OLD);v_after:=to_jsonb(NEW);
 END IF;
 v_row_id:=coalesce(v_after->>'id',v_before->>'id');
 IF TG_TABLE_NAME='CarAmplifierComponent' THEN
  v_link_md5:=md5(
   coalesce(v_after->>'amplifierId',v_before->>'amplifierId') || '/' ||
   coalesce(v_after->>'componentId',v_before->>'componentId'));
  v_row_id:=(substr(v_link_md5,1,12)||'5'||substr(v_link_md5,14,3)||
    '8'||substr(v_link_md5,18))::uuid::text;
  IF v_before IS NOT NULL THEN
   v_before:=v_before||jsonb_build_object('id',v_row_id);
  END IF;
  IF v_after IS NOT NULL THEN
   v_after:=v_after||jsonb_build_object('id',v_row_id);
  END IF;
 END IF;
 IF v_row_id IS NULL OR length(v_row_id)>200 THEN
  RAISE EXCEPTION 'USD VENUE journal requires stable entity id';
 END IF;
 SELECT coalesce((
  SELECT hash FROM venue_private.operation_journal
  WHERE stage_id=v_stage_id ORDER BY sequence DESC LIMIT 1
 ),repeat('0',64)) INTO v_previous;
 SELECT nextval('venue_private.operation_journal_sequence_seq') INTO v_sequence;
 v_occurred:=clock_timestamp();
 v_payload:=jsonb_build_object(
  'sequence',v_sequence,'stageId',v_stage_id,'table',TG_TABLE_NAME,
  'recordId',v_row_id,'operation',TG_OP,
  'before',v_before,'after',v_after,
  'recordedAt',to_char(v_occurred AT TIME ZONE 'UTC',
   'YYYY-MM-DD"T"HH24:MI:SS.US"Z')
 );
 v_hash:=encode(digest(v_previous||v_payload::text,'sha256'),'hex');
 INSERT INTO venue_private.operation_journal(
  sequence,stage_id,table_name,row_id,operation,occurred_at,previous_hash,hash,payload
 ) VALUES(v_sequence,v_stage_id,TG_TABLE_NAME,v_row_id,TG_OP,v_occurred,
  v_previous,v_hash,v_payload);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $journal$;
REVOKE ALL ON FUNCTION venue_private.capture_change() FROM PUBLIC;

-- Existing historic stage rows must not be writable through stale links.
CREATE OR REPLACE FUNCTION venue_private.keep_single_stage() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, venue_private AS $stage$
DECLARE v_active TEXT;
BEGIN
 IF session_user='usd_venue_root'
  AND current_setting('usd_venue.signed_import',true)='on' THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;
 SELECT stage_id INTO STRICT v_active FROM venue_private.active_stage;
 IF TG_OP='DELETE' OR
  (TG_OP='INSERT' AND NEW.id<>v_active) OR
  (TG_OP='UPDATE' AND (OLD.id<>v_active OR NEW.id<>v_active)) THEN
  RAISE EXCEPTION 'Historical stage is read-only';
 END IF;
 RETURN NEW;
END $stage$;

CREATE OR REPLACE FUNCTION venue_private.keep_active_registration() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, venue_private AS $guard$
DECLARE v_active TEXT;
DECLARE v_target TEXT;
DECLARE v_rid TEXT;
DECLARE v_row JSONB;
BEGIN
 IF session_user='usd_venue_root'
  AND current_setting('usd_venue.signed_import',true)='on' THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;
 SELECT stage_id INTO STRICT v_active FROM venue_private.active_stage;
 v_row:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME IN ('Registration','RegistrationNumber','ParticipantStageInspection','StageClass') THEN
  v_target:=v_row->>'stageId';
 ELSIF TG_TABLE_NAME IN ('Inspection','Result','RegistrationClass') THEN
  v_rid:=v_row->>'registrationId';
  IF TG_TABLE_NAME='RegistrationClass' THEN
   SELECT "stageId" INTO v_target FROM public."Registration" WHERE id=v_rid;
  ELSE
   SELECT "stageId" INTO v_target FROM public."Registration" WHERE id=v_rid;
  END IF;
 ELSIF TG_TABLE_NAME='RegistrationClassInspection' THEN
  SELECT r."stageId" INTO v_target
   FROM public."RegistrationClass" c JOIN public."Registration" r ON c."registrationId"=r.id
   WHERE c.id=v_row->>'registrationClassId';
 ELSE
  RAISE EXCEPTION 'Unexpected active-stage guard target';
 END IF;
 IF v_target IS NULL OR v_target<>v_active THEN
  RAISE EXCEPTION 'Past stage mutations prohibited: %',TG_TABLE_NAME;
 END IF;
 IF TG_OP='UPDATE' THEN
  -- Moving a record to another stage through UPDATE is also prohibited.
  IF TG_TABLE_NAME IN ('Registration','RegistrationNumber','ParticipantStageInspection','StageClass')
   AND to_jsonb(OLD)->>'stageId'<>v_active THEN
   RAISE EXCEPTION 'Cannot move historical record';
  END IF;
 END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION venue_private.keep_active_registration() FROM PUBLIC;
DO $install_guards$
DECLARE tab TEXT;
BEGIN
 FOREACH tab IN ARRAY ARRAY[
  'Registration','RegistrationNumber','ParticipantStageInspection','StageClass',
  'Result','Inspection','RegistrationClass','RegistrationClassInspection'
 ] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgname='usd_venue_'||lower(tab)||'_active' AND NOT tgisinternal) THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I
     FOR EACH ROW EXECUTE FUNCTION venue_private.keep_active_registration()',
    'usd_venue_'||lower(tab)||'_active',tab);
  END IF;
 END LOOP;
END $install_guards$;
COMMIT;
