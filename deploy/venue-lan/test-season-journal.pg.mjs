#!/usr/bin/env node
/** Real disposable PostgreSQL 18 regression of season migration.
 * Runs only against USD_VENUE_TEST_PG_URL on a CI-created DB, never Ubuntu.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {Client}=require('pg');
const url=process.env.USD_VENUE_TEST_PG_URL;
if(!url||!url.includes('127.0.0.1:5432/usd_venue_ci'))
 throw new Error('This script only accepts the isolated CI PostgreSQL database');
const root=new Client({connectionString:url});
const appUrl=new URL(url);appUrl.username='usd_venue';appUrl.password='ci-app-user-password';
const app=new Client({connectionString:appUrl.toString()});
const oldStage='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
const newStage='e510f672-79f7-44eb-8173-2a8ff94b1c0e';
const ZERO='0'.repeat(64);
const sql=async name=>(await readFile(new URL('./'+name,import.meta.url),'utf8'));
await root.connect();
try{
 await root.query("CREATE ROLE usd_venue LOGIN PASSWORD 'ci-app-user-password' NOSUPERUSER NOCREATEDB NOCREATEROLE");
 const tables=[
  'Stage','Participant','Car','CarConfiguration','CarConfigurationVersion',
  'CarAmplifier','CarAudioComponent','CarBattery','CarGenerator','CarHeadUnit',
  'CarAmplifierComponent','Registration','RegistrationNumber','RegistrationClass',
  'Inspection','ParticipantStageInspection','RegistrationClassInspection',
  'Result','Disqualification',
 ];
 for(const table of tables){
  await root.query(`CREATE TABLE public."${table}" (
   id TEXT PRIMARY KEY,"stageId" TEXT,"registrationId" TEXT,
   "registrationClassId" TEXT,"amplifierId" TEXT,"componentId" TEXT,name TEXT)`);
 }
 await root.query('GRANT USAGE ON SCHEMA public TO usd_venue');
 await root.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO usd_venue');
 await root.query('INSERT INTO public."Stage"(id) VALUES($1)',[oldStage]);
 await root.query(await sql('install-journal.sql'));
 await root.query(await sql('upgrade-journal-links.sql'));
 await root.query(await sql('install-season.sql'));
 await app.connect();
 await app.query('INSERT INTO public."Registration"(id,"stageId") VALUES($1,$2)',
  ['old-registration',oldStage]);
 await app.query('INSERT INTO public."Result"(id,"registrationId",name) VALUES($1,$2,$3)',
  ['old-result','old-registration','146.5']);
 let oldLog=(await root.query('SELECT sequence,hash,previous_hash FROM venue_private.operation_journal WHERE stage_id=$1 ORDER BY sequence',[oldStage])).rows;
 assert.equal(oldLog.length,2);
 assert.equal(oldLog[0].previous_hash,ZERO);
 assert.equal(oldLog[1].previous_hash,oldLog[0].hash);
 // A root-only signed baseline imports another stage WITHOUT logging any
 // centrally imported rows, then atomically switches the active selection.
 await root.query('BEGIN');
 try{
  await root.query("SELECT set_config('usd_venue.signed_import','on',true)");
  await root.query('INSERT INTO public."Stage"(id) VALUES($1)',[newStage]);
  await root.query('INSERT INTO public."Registration"(id,"stageId") VALUES($1,$2)',
   ['new-registration',newStage]);
  await root.query('UPDATE venue_private.active_stage SET stage_id=$1',[newStage]);
  await root.query('COMMIT');
 }catch(e){await root.query('ROLLBACK');throw e}
 assert.equal((await root.query('SELECT count(*)::int AS n FROM venue_private.operation_journal')).rows[0].n,2,
  'signed baseline was accidentally recorded as a judge edit');
 await app.query('INSERT INTO public."Result"(id,"registrationId",name) VALUES($1,$2,$3)',
  ['new-result','new-registration','148.1']);
 const bFirst=(await root.query('SELECT sequence,hash,previous_hash FROM venue_private.operation_journal WHERE stage_id=$1 ORDER BY sequence',[newStage])).rows;
 assert.equal(bFirst.length,1);
 assert.equal(bFirst[0].previous_hash,ZERO,'new stage must start own SHA-256 chain');
 assert.ok(Number(bFirst[0].sequence)>Number(oldLog[1].sequence));
 await assert.rejects(
  ()=>app.query('UPDATE public."Registration" SET name=$1 WHERE id=$2',
   ['tamper','old-registration']),
  /Past stage|Historical|prohibited|past stage/i,
 );
 await assert.rejects(
  ()=>app.query('INSERT INTO public."Stage"(id) VALUES($1)',
   ['illegal-stage']),
  /Historical stage|read-only/i,
 );
 // Ordinary restarts run this legacy link upgrade. It must not downgrade the
 // season-aware capture_change function or refuse a database with 2 stages.
 await root.query(await sql('upgrade-journal-links.sql'));
 await root.query(await sql('install-season.sql'));
 await app.query('INSERT INTO public."Result"(id,"registrationId",name) VALUES($1,$2,$3)',
  ['new-result-two','new-registration','149.2']);
 const bSecond=(await root.query('SELECT sequence,hash,previous_hash FROM venue_private.operation_journal WHERE stage_id=$1 ORDER BY sequence',[newStage])).rows;
 assert.equal(bSecond.length,2);
 assert.equal(bSecond[1].previous_hash,bSecond[0].hash);
 const after=(await root.query('SELECT sequence,hash,previous_hash FROM venue_private.operation_journal WHERE stage_id=$1 ORDER BY sequence',[oldStage])).rows;
 assert.deepEqual(after,oldLog,'historical stage journal must stay byte-for-byte identical');
 const allStages=(await root.query('SELECT id FROM public."Stage" ORDER BY id')).rows;
 assert.deepEqual(allStages.map(x=>x.id),[oldStage,newStage]);
 console.log('USD PG18 season: retained A, root import B, stage-specific SHA chain, read-only A — PASS');
}finally{
 try{await app.end()}catch{}
 await root.end();
}
