import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {postgresFullVenueAdapter} from './venue-full-adapter.mjs';
import {applyCompleteVenueJournal} from '../../deploy/venue-lan/full-return-apply.mjs';
import {FULL_RETURN_COVERAGE_TABLES} from '../../deploy/venue-lan/venue-return-package.mjs';

const url=process.env.VENUE_CENTRAL_TEST_DATABASE_URL;
if(!url||!url.includes('/usd_venue_ci'))throw Error('Only isolated usd_venue_ci PG18 permitted');
const client=new pg.Client({connectionString:url});
const uid=n=>'c510f672-79f7-44eb-8173-'+n.toString(16).padStart(12,'0');
const stage=uid(1),season=uid(2),direction=uid(3),cls=uid(4);
const participant=uid(21),car=uid(22),config=uid(23),version=uid(24),
 registration=uid(25),number=uid(26),regclass=uid(27),inspection=uid(28),result=uid(29);
const opts={stageId:stage,baselineSha256:'a'.repeat(64),apply:true,operator:'CI admin'};
const hash=n=>n.toString(16).padStart(64,'0');
async function query(sql,values=[]){return client.query(sql,values)}
let changes;
async function read(table,id){
 return (await query('SELECT to_jsonb(t) AS row FROM "'+table+'" t WHERE id=$1',[id])).rows[0]?.row??null;
}
async function createFixtures(numberValue=42){
 const events=[],ids=[
  ['Participant',participant],['Car',car],['CarConfiguration',config],
  ['CarConfigurationVersion',version],['Registration',registration],
  ['RegistrationNumber',number],['RegistrationClass',regclass],
  ['Inspection',inspection],['Result',result],
 ];
 await query('BEGIN');
 try{
  await query('INSERT INTO "Participant"(id,"firstName","lastName",city) VALUES ($1,$2,$3,$4)',
   [participant,'Новый','Участник','Омск']);
  await query('INSERT INTO "Car"(id,"participantId",brand,model,"registrationNumber") VALUES ($1,$2,$3,$4,$5)',
   [car,participant,'Lada','Vesta','А123АА181']);
  await query('INSERT INTO "CarConfiguration"(id,"carId",name) VALUES ($1,$2,$3)',[config,car,'SPL']);
  await query('INSERT INTO "CarConfigurationVersion"(id,"configurationId",version) VALUES ($1,$2,1)',
   [version,config]);
  await query('INSERT INTO "Registration"(id,"stageId","participantId","carId","configurationVersionId","configurationSnapshot","participantNumber",source) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)',
   [registration,stage,participant,car,version,'{}',numberValue,'ON_SITE']);
  await query('INSERT INTO "RegistrationNumber"(id,"stageId","registrationId",number,"isPrimary") VALUES ($1,$2,$3,$4,true)',
   [number,stage,registration,numberValue]);
  await query('INSERT INTO "RegistrationClass"(id,"registrationId","classId","numberId") VALUES ($1,$2,$3,$4)',
   [regclass,registration,cls,number]);
  await query('INSERT INTO "Inspection"(id,"registrationId",status,"checkedByName") VALUES ($1,$2,$3,$4)',
   [inspection,registration,'PASSED','Judge One']);
  await query('INSERT INTO "Result"(id,"registrationId","registrationClassId",value,unit,place,"isBest") VALUES ($1,$2,$3,$4,$5,$6,$7)',
   [result,registration,regclass,'154.120','DB',1,false]);
  let n=0;
  for(const [table,id] of ids){
   const after=await read(table,id);
   const sequence=++n;
   events.push({sequence,previousHash:hash(n-1),hash:hash(n),payload:{
    sequence,stageId:stage,table,recordId:id,operation:'INSERT',
    before:null,after,recordedAt:'2026-11-12T12:00:00.000Z',
   }});
  }
 }finally{await query('ROLLBACK')}
 return {format:2,journalCoverage:{fromSequence:0,tables:FULL_RETURN_COVERAGE_TABLES},stageId:stage,baselineSha256:opts.baselineSha256,
  journalEndHash:events.at(-1).hash,eventCount:events.length,events};
}
test.before(async()=>{
 await client.connect();
 assert.equal((await query('SELECT current_database() AS name')).rows[0].name,'usd_venue_ci');
 // Prisma @updatedAt is managed by the application, not by PostgreSQL itself.
 // These isolated fixture inserts are made through raw SQL; supply its
 // ordinary application-side timestamp explicitly in the disposable test DB.
 for(const table of ['Season','Stage','Direction','Class','Participant','Car',
  'CarConfiguration','Inspection','Result']){
  await query('ALTER TABLE "'+table+'" ALTER COLUMN "updatedAt" SET DEFAULT now()');
 }
 await query('INSERT INTO "Season"(id,name,year,status) VALUES ($1,$2,$3,$4)',
  [season,'Venue 2026',2026,'ACTIVE']);
 await query('INSERT INTO "Stage"(id,"seasonId","stageNumber",name,date,status) VALUES ($1,$2,$3,$4,$5,$6)',
  [stage,season,1,'Offline test','2026-11-12','PUBLISHED']);
 await query('INSERT INTO "Direction"(id,name) VALUES ($1,$2)',[direction,'SPL']);
 await query('INSERT INTO "Class"(id,"directionId",code,name,unit) VALUES ($1,$2,$3,$4,$5)',
  [cls,direction,'VENUE_INTEGRATION','SPL 1','DB']);
 await query('INSERT INTO "StageClass"(id,"stageId","classId") VALUES ($1,$2,$3)',
  [uid(5),stage,cls]);
 changes=await createFixtures();
});
test.after(async()=>await client.end());

test('PG18: same FIO created centrally during WAN outage blocks duplicate offline profile atomically',async()=>{
 const centralId=uid(88);
 await query('INSERT INTO "Participant"(id,"firstName","lastName",city) VALUES ($1,$2,$3,$4)',
  [centralId,'  НОВЫЙ  ','Участник','Омск']);
 try{
  const adapter=postgresFullVenueAdapter(client);
  await assert.rejects(
   ()=>applyCompleteVenueJournal(changes,adapter,{...opts,apply:false}),
   /MANUAL_REVIEW.*DUPLICATE_PARTICIPANT_NAME/
  );
  assert.equal(await read('Participant',participant),null,'offline UUID not imported');
  assert.equal(await read('Registration',registration),null,'registration not partially imported');
  assert.equal(await read('Result',result),null,'score not partially imported');
  assert.notEqual(await read('Participant',centralId),null,'central participant preserved');
 }finally{
  await query('DELETE FROM "Participant" WHERE id=$1',[centralId]);
 }
});

test('PG18: a central car with the same plate but different owner forces manual review',async()=>{
 const personId=uid(89),vehicleId=uid(90);
 await query('INSERT INTO "Participant"(id,"firstName","lastName") VALUES ($1,$2,$3)',
  [personId,'Иван','Совсемдругой']);
 await query('INSERT INTO "Car"(id,"participantId",brand,model,"registrationNumber") VALUES ($1,$2,$3,$4,$5)',
  [vehicleId,personId,'Lada','Vesta','A123AA181']);
 try{
  await assert.rejects(
   ()=>applyCompleteVenueJournal(changes,postgresFullVenueAdapter(client),{...opts,apply:false}),
   /MANUAL_REVIEW.*DUPLICATE_(CAR_PLATE|PARTICIPANT_BY_PLATE)/
  );
  assert.equal(await read('Participant',participant),null);
  assert.equal(await read('Car',car),null);
  assert.equal(await read('Result',result),null);
 }finally{
  await query('DELETE FROM "Car" WHERE id=$1',[vehicleId]);
  await query('DELETE FROM "Participant" WHERE id=$1',[personId]);
 }
});

test('PG18: approved LINK transfers same signed registration, number, inspection and score to existing central USD ID',async()=>{
 const centralId=uid(188),adminId=uid(189),reviewId=uid(190);
 await query('INSERT INTO "Participant"(id,"firstName","lastName",city) VALUES ($1,$2,$3,$4)',
  [centralId,'Новый','Участник','Омск']);
 await query('INSERT INTO "User"(id,email,"passwordHash",role,"updatedAt") VALUES ($1,$2,$3,$4,now())',
  [adminId,'venue-review-test@example.invalid','ci-only-hash','ADMIN']);
 const decision={
  key:'Participant:'+participant,table:'Participant',sourceId:participant,
  action:'LINK',targetId:centralId,candidateIds:[centralId],
  reason:'Проверен оригинальный профиль и результаты',
 };
 const approved={...opts,reviewId,approvedBy:adminId,
  resolutions:{[decision.key]:decision}};
 try{
  const adapter=postgresFullVenueAdapter(client);
  const dry=await applyCompleteVenueJournal(changes,adapter,{...approved,apply:false});
  assert.equal(dry.readyEvents,9);
  assert.equal(await read('Participant',participant),null);
  const accepted=await applyCompleteVenueJournal(changes,adapter,approved);
  assert.equal(accepted.appliedEvents,9);
  assert.equal(await read('Participant',participant),null,'no duplicate profile');
  assert.equal((await read('Registration',registration)).participantId,centralId);
  assert.equal((await read('Car',car)).participantId,centralId);
  assert.equal((await read('RegistrationNumber',number)).number,42);
  assert.equal((await read('Inspection',inspection)).status,'PASSED');
  assert.equal((await read('Result',result)).value,154.12);
  const audited=await query('SELECT metadata FROM "AuditLog" WHERE action=$1 AND "entityId"=$2',
   ['VENUE_RETURN_IDENTITY_RESOLVED',participant]);
  assert.equal(audited.rows.length,1);
  assert.equal(audited.rows[0].metadata.reviewId,reviewId);
  assert.equal(audited.rows[0].metadata.targetId,centralId);
  assert.equal((await applyCompleteVenueJournal(changes,adapter,approved)).alreadyApplied,true);
  await assert.rejects(()=>applyCompleteVenueJournal(changes,adapter,opts),
   /partial, unknown or different journal receipts/);
 }finally{
  // This test uses production migration SQL but only an isolated CI database;
  // remove the completed signed stage graph for following baseline tests.
  for(const table of ['Result','Inspection','RegistrationClass','RegistrationNumber',
   'Registration','CarConfigurationVersion','CarConfiguration','Car']){
   const id={Result:result,Inspection:inspection,RegistrationClass:regclass,
    RegistrationNumber:number,Registration:registration,
    CarConfigurationVersion:version,CarConfiguration:config,Car:car}[table];
   await query('DELETE FROM "'+table+'" WHERE id=$1',[id]);
  }
  await query('DELETE FROM "AuditLog" WHERE action IN ($1,$2) AND metadata->>$3=$4',
   ['VENUE_FULL_EVENT_IMPORTED','VENUE_RETURN_IDENTITY_RESOLVED','journalEndHash',changes.journalEndHash]);
  await query('DELETE FROM "User" WHERE id=$1',[adminId]);
  await query('DELETE FROM "Participant" WHERE id=$1',[centralId]);
 }
});

test('PG18: full offline entrants, configs, number, inspection and result write atomically',async()=>{
 const adapter=postgresFullVenueAdapter(client);
 const preview=await applyCompleteVenueJournal(changes,adapter,{...opts,apply:false});
 assert.equal(preview.readyEvents,9);
 assert.equal(await read('Participant',participant),null);
 const outcome=await applyCompleteVenueJournal(changes,adapter,opts);
 assert.equal(outcome.appliedEvents,9);
 assert.equal(outcome.databaseSynchronized,true);
 assert.equal((await read('RegistrationNumber',number)).number,42);
 assert.equal((await read('Result',result)).value,154.12);
 assert.equal((await query('SELECT count(*)::int AS n FROM "AuditLog" WHERE action=$1',
  ['VENUE_FULL_EVENT_IMPORTED'])).rows[0].n,9);
 const replay=await applyCompleteVenueJournal(changes,adapter,opts);
 assert.equal(replay.alreadyApplied,true);
 assert.equal(replay.appliedEvents,0);
});
test('PG18: incompatible new event or stolen number cannot produce partial writes',async()=>{
 const adapter=postgresFullVenueAdapter(client);
 const conflicting=structuredClone(changes);
 conflicting.events[5].payload.after.number=42;
 conflicting.events[0].payload.after.id=uid(99);
 conflicting.events[0].payload.recordId=uid(99);
 // A changed journal is a different upload, not silently re-acknowledged.
 conflicting.journalEndHash='d'.repeat(64);
 await assert.rejects(()=>applyCompleteVenueJournal(conflicting,adapter,opts),/CONFLICT/);
 assert.equal(await read('Participant',uid(99)),null);
});

test('PG18: signed LAN edits supersede changed online inspection, result and stage metadata without erasing configuration',async()=>{
 // This disposable database already accepted a complete stage above. Emulate
 // a fresh pre-return stage by retiring those test-only receipts, not data.
 await query('DELETE FROM "AuditLog" WHERE action=$1 AND metadata->>\'stageId\'=$2',
  ['VENUE_FULL_EVENT_IMPORTED',stage]);
 const baseRegistration=await read('Registration',registration);
 const baseInspection=await read('Inspection',inspection);
 const baseResult=await read('Result',result);
 assert.ok(baseRegistration&&baseInspection&&baseResult);
 const offlineRegistration={...baseRegistration,teamNameAtInspection:'Судейский протокол'};
 const offlineInspection={...baseInspection,status:'PASSED',notes:'Проверено в офлайне'};
 const offlineResult={...baseResult,value:155.33,notes:'Официальный результат площадки'};
 await query('UPDATE "Registration" SET "configurationSnapshot"=$1::jsonb,"privacyConsentVersion"=$2 WHERE id=$3',
  [JSON.stringify({existingFullEquipment:'online'}),'privacy-v42',registration]);
 await query('UPDATE "Inspection" SET notes=$1 WHERE id=$2',['Предварительно онлайн',inspection]);
 await query('UPDATE "Result" SET value=$1,notes=$2 WHERE id=$3',['141.000','Предварительно онлайн',result]);
 const draft=[
  {table:'Registration',recordId:registration,before:baseRegistration,after:offlineRegistration},
  {table:'Inspection',recordId:inspection,before:baseInspection,after:offlineInspection},
  {table:'Result',recordId:result,before:baseResult,after:offlineResult},
 ];
 const events=draft.map((entry,index)=>{
  const sequence=index+1;
  return {sequence,previousHash:hash(index),hash:hash(sequence),payload:{
   sequence,stageId:stage,table:entry.table,recordId:entry.recordId,operation:'UPDATE',
   before:entry.before,after:entry.after,recordedAt:'2026-11-13T10:00:00.000Z',
  }};
 });
 const journal={format:2,journalCoverage:{fromSequence:0,tables:FULL_RETURN_COVERAGE_TABLES},
  stageId:stage,baselineSha256:opts.baselineSha256,journalEndHash:events.at(-1).hash,
  eventCount:events.length,events};
 const report=await applyCompleteVenueJournal(journal,postgresFullVenueAdapter(client),opts);
 assert.equal(report.appliedEvents,3);
 assert.equal((await read('Inspection',inspection)).notes,'Проверено в офлайне');
 assert.equal((await read('Result',result)).value,155.33);
 const imported=await read('Registration',registration);
 assert.equal(imported.teamNameAtInspection,'Судейский протокол');
 assert.deepEqual(imported.configurationSnapshot,{existingFullEquipment:'online'});
 assert.equal(imported.privacyConsentVersion,'privacy-v42');
 const audit=(await query('SELECT metadata FROM "AuditLog" WHERE action=$1 AND metadata->>\'stageId\'=$2',
  ['VENUE_OFFLINE_STAGE_OVERRIDE',stage])).rows;
 assert.equal(audit.length,3);
 assert.equal(audit.find(x=>x.metadata.table==='Result')?.metadata.before.value,141);
 assert.equal((await applyCompleteVenueJournal(journal,postgresFullVenueAdapter(client),opts)).alreadyApplied,true);
});

test('PG18: new LAN result UUID replaces provisional central score in the same registration class',async()=>{
 await query('DELETE FROM "AuditLog" WHERE action=$1 AND metadata->>\'stageId\'=$2',
  ['VENUE_FULL_EVENT_IMPORTED',stage]);
 const old=await read('Result',result);
 assert.ok(old);
 const newId=uid(222);
 const after={...old,id:newId,value:156.78,notes:'Поздний итог судей'};
 const events=[{sequence:1,previousHash:hash(0),hash:hash(1),payload:{
  sequence:1,stageId:stage,table:'Result',recordId:newId,
  operation:'INSERT',before:null,after,recordedAt:'2026-11-13T12:00:00.000Z',
 }}];
 const journal={format:2,journalCoverage:{fromSequence:0,tables:FULL_RETURN_COVERAGE_TABLES},
  stageId:stage,baselineSha256:opts.baselineSha256,
  journalEndHash:hash(1),eventCount:1,events};
 const report=await applyCompleteVenueJournal(journal,postgresFullVenueAdapter(client),opts);
 assert.equal(report.appliedEvents,1);
 assert.equal(await read('Result',result),null);
 assert.equal((await read('Result',newId)).value,156.78);
 const audit=(await query('SELECT metadata FROM "AuditLog" WHERE action=$1 AND "entityId"=$2',
  ['VENUE_OFFLINE_STAGE_OVERRIDE',newId])).rows;
 assert.equal(audit.length,1);
 assert.equal(audit[0].metadata.before.id,result);
 assert.equal(audit[0].metadata.reason,'OFFLINE_STAGE_SLOT_REPLACED');
 assert.equal((await applyCompleteVenueJournal(journal,postgresFullVenueAdapter(client),opts)).alreadyApplied,true);
});
