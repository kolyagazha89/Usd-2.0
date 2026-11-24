import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import pg from 'pg';
import {postgresFullVenueAdapter} from './venue-full-adapter.mjs';
import {applyCompleteVenueJournal} from '../../deploy/venue-lan/full-return-apply.mjs';
import {FULL_RETURN_COVERAGE_TABLES,encryptVenueReturn,makeVenueReturnSnapshot,signVenueReturnSnapshot} from '../../deploy/venue-lan/venue-return-package.mjs';
import {derivedPassphrase,tokenHash} from './venue-sync/authority.mjs';
import {applyVenueParticipantDirectory} from '../../deploy/venue-lan/import-stage.mjs';

const url=process.env.VENUE_CENTRAL_TEST_DATABASE_URL;
if(!url||new URL(url).pathname!=='/usd_return_ci'||new URL(url).hostname!=='127.0.0.1')
 throw Error('Only isolated usd_return_ci PG18 on loopback permitted');
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
 assert.equal((await query('SELECT current_database() AS name')).rows[0].name,'usd_return_ci');
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

test('PG18 + actual Nest HTTP route: rejected requests roll back and a successful journal replays without duplicates',async()=>{
 const adapter=postgresFullVenueAdapter(client);
 const preview=await applyCompleteVenueJournal(changes,adapter,{...opts,apply:false});
 assert.equal(preview.readyEvents,9);
 assert.equal(await read('Participant',participant),null);

 const require=createRequire(import.meta.url);
 const {NestFactory}=require('@nestjs/core');
 const {Module}=require('@nestjs/common');
 const {StagesController}=require('../dist/stages/stages.controller.js');
 const {StagesService}=require('../dist/stages/stages.service.js');
 const {VenueAutoSyncService}=require('../dist/stages/venue-auto-sync.service.js');
 const {VenueStageService}=require('../dist/stages/venue-stage.service.js');
 const {VenueCertificateService}=require('../dist/stages/venue-certificate.service.js');
 const {VenueReturnReviewService}=require('../dist/stages/venue-return-review.service.js');
 const {PrismaService}=require('../dist/prisma/prisma.service.js');
 process.env.DATABASE_URL=url;
 class ReturnTestModule {}
 Module({controllers:[StagesController],providers:[PrismaService,VenueAutoSyncService,VenueReturnReviewService,
  ...[StagesService,VenueStageService,VenueCertificateService].map(provide=>({provide,useValue:{}})),
 ]})(ReturnTestModule);
 const app=await NestFactory.create(ReturnTestModule,{logger:false,abortOnError:false});
 try{
  await app.listen(0,'127.0.0.1');
  const prisma=app.get(PrismaService);
  const token=randomBytes(32).toString('base64url');
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const publicKeyPem=publicKey.export({type:'spki',format:'pem'}).toString();
  const privatePem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
  const grant=await prisma.venueSyncAuthorization.create({data:{stageId:stage,
   baselineSha256:opts.baselineSha256,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+3600000)}});
  const submit=async({events=changes.events,baselineSha256=opts.baselineSha256,authToken=token,authorization='Venue '+authToken,seal=true}={})=>{
   const snapshot=makeVenueReturnSnapshot({...changes,events,baselineSha256});
   const envelope=seal?encryptVenueReturn(signVenueReturnSnapshot(snapshot,privatePem),derivedPassphrase(authToken)):{};
   const response=await fetch(await app.getUrl()+'/stages/venue/sync',{method:'POST',
    body:JSON.stringify({stageId:stage,publicKeyPem,envelope}),
    headers:{'content-type':'application/json',authorization},signal:AbortSignal.timeout(20000)});
   return {status:response.status,body:await response.json()};
  };
  assert.equal((await submit({authorization:'Bearer invalid'})).status,401);
  assert.equal((await submit({seal:false})).status,400);
  await query('UPDATE "Stage" SET "resultsPublishedAt"=now() WHERE id=$1',[stage]);
  const published=await submit();
  assert.equal(published.status,409);
  assert.equal(published.body.code,'RESULTS_ALREADY_PUBLISHED');
  await query('UPDATE "Stage" SET "resultsPublishedAt"=NULL WHERE id=$1',[stage]);

  const missingOwner=structuredClone(changes.events);
  missingOwner.find(e=>e.payload.table==='Registration').payload.after.carId=uid(191);
  const missing=await submit({events:missingOwner});
  assert.equal(missing.status,409);
  assert.equal(missing.body.code,'RETURN_REFERENCE_MISSING');
  assert.equal(await read('Car',car),null,'foreign-key error rolls back earlier signed writes');

  await query('ALTER TABLE "CarConfiguration" RENAME COLUMN name TO ci_missing_column');
  try{
   const drifted=await submit();
   assert.equal(drifted.status,503);
   assert.equal(drifted.body.code,'RETURN_DB_SCHEMA');
   assert.match(drifted.body.reference,/^[a-f0-9]{12}$/);
   assert.equal(drifted.body.eventSequence,3);
   assert.doesNotMatch(JSON.stringify(drifted.body),/ci_missing_column|CarConfiguration|\bINSERT\b/);
   assert.equal(await read('Car',car),null,'schema error rolls back earlier signed writes');
  }finally{await query('ALTER TABLE "CarConfiguration" RENAME COLUMN ci_missing_column TO name')}
  assert.equal((await prisma.venueSyncAuthorization.findUniqueOrThrow({where:{id:grant.id}})).acceptedAt,null);

  const accepted=await submit();
  assert.equal(accepted.status,201,JSON.stringify(accepted.body));
  assert.equal(accepted.body.databaseSynchronized,true);
  assert.equal(accepted.body.derivedRankingsRebuilt,true);
  assert.equal(accepted.body.journalEndHash,changes.journalEndHash);
  assert.deepEqual(await submit(),accepted,'valid retry must return the same receipt');
  const acceptedGrant=await prisma.venueSyncAuthorization.findUniqueOrThrow({where:{id:grant.id}});
  assert.equal(acceptedGrant.lastJournalHash,changes.journalEndHash);
  const newToken=randomBytes(32).toString('base64url'),freshBaseline='c'.repeat(64);
  await prisma.venueSyncAuthorization.create({data:{stageId:stage,baselineSha256:freshBaseline,
   tokenHash:tokenHash(newToken),expiresAt:new Date(Date.now()+3600000),
   createdAt:new Date(acceptedGrant.acceptedAt.getTime()+1)}});
  const latest=structuredClone(changes.events.slice(0,2));
  Object.assign(latest[0].payload.after,{id:uid(198),firstName:'Следующий',lastName:'Приехавший'});
  Object.assign(latest[1].payload.after,{id:uid(199),participantId:uid(198),registrationNumber:'А521АА181'});
  for(let i=0;i<latest.length;i++){
   latest[i].hash=hash(801+i);
   latest[i].previousHash=i?latest[i-1].hash:hash(0);
   latest[i].payload.recordId=latest[i].payload.after.id;
  }
  const next=await submit({events:latest,baselineSha256:freshBaseline,authToken:newToken});
  assert.equal(next.status,201,JSON.stringify(next.body));
  assert.equal(next.body.journalEndHash,latest.at(-1).hash);
  assert.ok(await read('Car',uid(199)));
  assert.deepEqual(await submit(),accepted,'an acknowledged old baseline remains replayable');
  assert.deepEqual((await prisma.venueSyncAuthorization.findUniqueOrThrow({where:{id:grant.id}})).acceptedAt,acceptedGrant.acceptedAt);
 }finally{await app.close()}
 assert.equal((await read('RegistrationNumber',number)).number,42);
 assert.equal((await read('Result',result)).value,154.12);
 assert.equal((await query('SELECT count(*)::int AS n FROM "AuditLog" WHERE action=$1',
  ['VENUE_FULL_EVENT_IMPORTED'])).rows[0].n,11);
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

test('PG18: a legacy offline package reopens the cancelled central car entry and keeps one registration on replay',async()=>{
 const secondStage=uid(500),retained=uid(501),signedRegistration=uid(502);
 const otherProfile=uid(510),otherCar=uid(511);
 await query('INSERT INTO "Stage"(id,"seasonId","stageNumber",name,date,status) VALUES ($1,$2,2,$3,$4,$5)',
  [secondStage,season,'New independent stage','2026-11-21','PUBLISHED']);
 await query('INSERT INTO "StageClass"(id,"stageId","classId") VALUES ($1,$2,$3)',[uid(503),secondStage,cls]);
 await query('INSERT INTO "Registration"(id,"stageId","participantId","carId","configurationVersionId","configurationSnapshot","participantNumber",source,status,"privacyConsentVersion") VALUES ($1,$2,$3,$4,$5,$6::jsonb,-1,$7,$8,$9)',
  [retained,secondStage,participant,car,version,'{"onlineHistory":true}','PRE_REGISTRATION','CANCELLED','privacy-preserved']);
 const initial=changes.events.map(e=>e.payload.after);
 const draft=[
  ['Registration',{...initial[4],id:signedRegistration,stageId:secondStage}],
  ['RegistrationNumber',{...initial[5],id:uid(504),stageId:secondStage,registrationId:signedRegistration}],
  ['RegistrationClass',{...initial[6],id:uid(505),registrationId:signedRegistration,numberId:uid(504)}],
  ['Inspection',{...initial[7],id:uid(506),registrationId:signedRegistration}],
  ['Result',{...initial[8],id:uid(507),registrationId:signedRegistration,registrationClassId:uid(505)}],
  ['Participant',{...initial[0],id:otherProfile,firstName:'Гость',lastName:'НоваяЗапись'}],
  ['Car',{...initial[1],id:otherCar,participantId:otherProfile,registrationNumber:'А321АА181'}],
 ];
 const events=draft.map(([table,after],index)=>({sequence:index+1,previousHash:hash(index),hash:hash(index+1),
  payload:{sequence:index+1,stageId:secondStage,table,recordId:after.id,operation:'INSERT',
   before:null,after,recordedAt:'2026-11-21T12:00:00.000Z'}}));
 const journal={...changes,stageId:secondStage,events,eventCount:events.length,journalEndHash:events.at(-1).hash};
 const options={...opts,stageId:secondStage};
 const adapter=postgresFullVenueAdapter(client);
 await query('UPDATE "Registration" SET status=\'ACTIVE\' WHERE id=$1',[retained]);
 await assert.rejects(()=>applyCompleteVenueJournal(journal,adapter,options),{code:'CAR_REGISTRATION_EXISTS'});
 assert.equal(await read('Car',otherCar),null);
 await query('UPDATE "Registration" SET status=\'CANCELLED\' WHERE id=$1',[retained]);
 assert.equal((await applyCompleteVenueJournal(journal,adapter,{...options,apply:false})).readyEvents,events.length);
 assert.equal((await read('Registration',retained)).status,'CANCELLED');
 assert.equal((await applyCompleteVenueJournal(journal,adapter,options)).appliedEvents,events.length);
 assert.equal(await read('Registration',signedRegistration),null);
 const saved=await read('Registration',retained);
 assert.equal(saved.status,'ACTIVE');
 assert.equal(saved.participantNumber,42);
 assert.equal(saved.privacyConsentVersion,'privacy-preserved');
 assert.deepEqual(saved.configurationSnapshot,{onlineHistory:true});
 assert.equal((await read('RegistrationNumber',uid(504))).registrationId,retained);
 assert.equal((await read('Inspection',uid(506))).registrationId,retained);
 assert.equal((await read('Result',uid(507))).registrationId,retained);
 assert.equal((await read('Car',otherCar)).participantId,otherProfile);
 assert.equal((await query('SELECT count(*)::int AS n FROM "AuditLog" WHERE "entityId"=$1 AND metadata->>\'reason\'=$2',
  [retained,'OFFLINE_CANCELLED_REGISTRATION_REOPENED'])).rows[0].n,1);
 assert.equal((await applyCompleteVenueJournal(journal,adapter,options)).alreadyApplied,true);
});

test('PG18: signed preflight updates the roster in place before judging, with local work protected',async()=>{
 const readyStage=uid(600),retained=uid(601),numberId=uid(602),classEntry=uid(603);
 await query('INSERT INTO "Stage"(id,"seasonId","stageNumber",name,date,status) VALUES ($1,$2,3,$3,$4,$5)',
  [readyStage,season,'Ready stage','2026-11-28','PUBLISHED']);
 await query('INSERT INTO "StageClass"(id,"stageId","classId") VALUES ($1,$2,$3)',[uid(604),readyStage,cls]);
 await query('INSERT INTO "Registration"(id,"stageId","participantId","carId","configurationVersionId","configurationSnapshot","participantNumber",source,status) VALUES ($1,$2,$3,$4,$5,$6::jsonb,-1,$7,$8)',
  [retained,readyStage,participant,car,version,'{}','PRE_REGISTRATION','CANCELLED']);
 await query('CREATE ROLE usd_venue_root WITH SUPERUSER LOGIN PASSWORD \'venue-test-only-password\'');
 await query('CREATE SCHEMA venue_private');
 await query('CREATE TABLE venue_private.active_stage(singleton boolean PRIMARY KEY, stage_id text NOT NULL)');
 await query('CREATE TABLE venue_private.operation_journal(stage_id text NOT NULL)');
 await query('INSERT INTO venue_private.active_stage VALUES (true,$1)',[readyStage]);
 await query('INSERT INTO "AuditLog"(id,action,entity,"entityId",metadata) VALUES ($1,$2,$3,$4,$5)',
  [uid(605),'VENUE_STAGE_PACKAGE_IMPORTED','Stage',readyStage,{sha256:'a'.repeat(64)}]);
 const require=createRequire(import.meta.url);
 const {PrismaPg}=require('@prisma/adapter-pg');
 const {PrismaClient}=require('../dist/generated/prisma/client.js');
 const localUrl=new URL(url);localUrl.username='usd_venue_root';localUrl.password='venue-test-only-password';
 const local=new PrismaClient({adapter:new PrismaPg({connectionString:localUrl.toString()})});
 try{
  const row={...changes.events[4].payload.after,id:retained,stageId:readyStage,status:'ACTIVE',
   numbers:[{id:numberId,number:42,isPrimary:true}],classes:[{id:classEntry,classId:cls,numberId}],results:[]};
  const packagePlan={packageHash:'b'.repeat(64),participantDirectory:[],configurations:[],registrations:[row],
   snapshot:{stageId:readyStage,stage:{stageClasses:[{classId:cls,isActive:true}]}}};
  const options={stageId:readyStage,refreshRoster:true};
  assert.equal((await applyVenueParticipantDirectory(packagePlan,local,options)).refreshedRegistrations,1);
  assert.equal((await read('Registration',retained)).status,'ACTIVE');
  assert.equal((await read('RegistrationNumber',numberId)).number,42);
  assert.equal((await applyVenueParticipantDirectory(packagePlan,local,options)).refreshedRegistrations,0);
  await query('INSERT INTO venue_private.operation_journal VALUES ($1)',[readyStage]);
  await assert.rejects(()=>applyVenueParticipantDirectory(packagePlan,local,options),/ROSTER_ALREADY_USED/);
  assert.equal((await read('RegistrationClass',classEntry)).numberId,numberId);
 }finally{await local.$disconnect()}
});
