import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {postgresVenueAdapter} from './apply-venue-return.mjs';
import {applyVenueReturnSnapshot} from '../../deploy/venue-lan/central-return-apply.mjs';

const url=process.env.VENUE_CENTRAL_TEST_DATABASE_URL;
if(!url||!url.includes('/usd_venue_ci'))throw Error('Only isolated usd_venue_ci PostgreSQL database permitted');
const client=new pg.Client({connectionString:url});
const stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
const participant='e510f672-79f7-44eb-8173-2a8ff94b1c0e';
const registration='cf0328c0-609c-4503-b92b-3c058d72372a';
const cls='5a4b83a1-51f5-4c2f-81c7-a01b78bcb51f';
const classId='dfe5a37d-4d3c-40d8-a7b4-70b509012346';
const inspection='d510f672-79f7-44eb-8173-2a8ff94b1c0e';
const result='b610f672-79f7-44eb-8173-2a8ff94b1c0e';
const baseline='a'.repeat(64);
const inspectedAt=new Date(Date.now()-60000).toISOString();
const inspectionEvent=()=>({
 sequence:1,hash:'b'.repeat(64),payload:{table:'ParticipantStageInspection',
 operation:'INSERT',recordId:inspection,after:{
  id:inspection,participantId:participant,stageId:stage,status:'PASSED',notes:null,
  checkedByName:'USD judge',checkedAt:inspectedAt,
 }}
});
const scoreEvent=(value='152.345')=>({
 sequence:2,hash:'c'.repeat(64),payload:{table:'Result',operation:'INSERT',
 recordId:result,after:{id:result,registrationId:registration,registrationClassId:cls,
 value,unit:'DB',place:1,isBest:false,notes:null,isHistorical:false,
 verificationStatus:'NOT_REQUIRED'}}
});
const packet=(value='152.345')=>({stageId:stage,baselineSha256:baseline,
 journalEndHash:'c'.repeat(64),events:[inspectionEvent(),scoreEvent(value)]});
const opts={stageId:stage,baselineSha256:baseline,apply:true,operator:'Venue CI admin'};

test.before(async()=>{
 await client.connect();
 assert.equal((await client.query('SELECT current_database() AS db')).rows[0].db,'usd_venue_ci');
 const ddl=[
  'CREATE TABLE "Stage"(id uuid PRIMARY KEY,status text,"isDeleted" boolean,"resultsPublishedAt" timestamptz,"seasonId" uuid)',
  'CREATE TABLE "Registration"(id uuid PRIMARY KEY,"stageId" uuid,"participantId" uuid,status text,"participantStageInspectionId" uuid)',
  'CREATE TABLE "Class"(id uuid PRIMARY KEY,unit text,"isActive" boolean)',
  'CREATE TABLE "StageClass"("stageId" uuid,"classId" uuid,"isActive" boolean)',
  'CREATE TABLE "RegistrationClass"(id uuid PRIMARY KEY,"registrationId" uuid,"classId" uuid)',
  'CREATE TABLE "Inspection"("registrationId" uuid,status text)',
  'CREATE TABLE "Disqualification"("participantId" uuid,status text,scope text,"stageId" uuid,"seasonId" uuid)',
  'CREATE TABLE "ParticipantStageInspection"(id uuid PRIMARY KEY,"participantId" uuid,"stageId" uuid,status text,notes text,"checkedByName" text,"checkedAt" timestamptz,"createdAt" timestamptz,"updatedAt" timestamptz,UNIQUE("participantId","stageId"))',
  'CREATE TABLE "Result"(id uuid PRIMARY KEY,"registrationId" uuid,"registrationClassId" uuid UNIQUE,value numeric(10,3) CHECK(value<200),unit text,place integer,"isBest" boolean,notes text,"createdByUserId" uuid,"isHistorical" boolean,"verificationStatus" text,"createdAt" timestamptz,"updatedAt" timestamptz)',
  'CREATE TABLE "AuditLog"(id uuid PRIMARY KEY,action text,entity text,"entityId" uuid,metadata jsonb,"createdAt" timestamptz)',
 ];
 for(const statement of ddl)await client.query(statement);
 await client.query('INSERT INTO "Stage"(id,status,"isDeleted","resultsPublishedAt","seasonId") VALUES ($1,$2,false,NULL,$3)',
  [stage,'PUBLISHED','a710f672-79f7-44eb-8173-2a8ff94b1c0e']);
 await client.query('INSERT INTO "Registration"(id,"stageId","participantId",status,"participantStageInspectionId") VALUES ($1,$2,$3,$4,NULL)',
  [registration,stage,participant,'ACTIVE']);
 await client.query('INSERT INTO "Class"(id,unit,"isActive") VALUES ($1,$2,true)',[classId,'DB']);
 await client.query('INSERT INTO "RegistrationClass"(id,"registrationId","classId") VALUES ($1,$2,$3)',[cls,registration,classId]);
 await client.query('INSERT INTO "StageClass"("stageId","classId","isActive") VALUES ($1,$2,true)',[stage,classId]);
});
test.after(async()=>{await client.end()});
test('PG18: inspection, result and audit receipts commit, replay without duplicates',async()=>{
 const adapter=postgresVenueAdapter(client);
 const first=await applyVenueReturnSnapshot(packet(),adapter,opts);
 assert.equal(first.counts.APPLIED,2);
 const linked=(await client.query('SELECT "participantStageInspectionId" FROM "Registration" WHERE id=$1',[registration])).rows[0];
 assert.equal(linked.participantStageInspectionId,inspection);
 const retry=await applyVenueReturnSnapshot(packet(),adapter,opts);
 assert.equal(retry.counts.ALREADY_APPLIED,2);
 assert.equal((await client.query('SELECT count(*)::int AS n FROM "Result"')).rows[0].n,1);
 assert.equal((await client.query('SELECT count(*)::int AS n FROM "AuditLog"')).rows[0].n,2);
});
test('PG18: an identical score with a foreign signed event is a conflict',async()=>{
 const changed=packet();changed.events[1].hash='d'.repeat(64);
 const report=await applyVenueReturnSnapshot(changed,postgresVenueAdapter(client),opts);
 assert.equal(report.counts.CONFLICT,1);
 assert.equal(report.counts.ALREADY_APPLIED,1);
});
test('PG18: failed result SQL rolls back inspection and receipt',async()=>{
 await client.query('TRUNCATE "AuditLog","Result","ParticipantStageInspection"');
 await client.query('UPDATE "Registration" SET "participantStageInspectionId"=NULL');
 await assert.rejects(()=>applyVenueReturnSnapshot(packet('201.000'),postgresVenueAdapter(client),opts));
 assert.equal((await client.query('SELECT count(*)::int AS n FROM "ParticipantStageInspection"')).rows[0].n,0);
 assert.equal((await client.query('SELECT count(*)::int AS n FROM "AuditLog"')).rows[0].n,0);
 assert.equal((await client.query('SELECT "participantStageInspectionId" FROM "Registration"')).rows[0].participantStageInspectionId,null);
});
