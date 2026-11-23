#!/usr/bin/env node
/** Destructive ONLY to two disposable CI PostgreSQL databases.
 * End-to-end: original signed venue stage already installed by seed -> 100
 * real LAN API entries/inspections + 1..5 regular classes and extra BassRace
 * stickers -> root-owned append-only journal -> signed encrypted export ->
 * central dry-run/import/replay, with a protected second stage.
 */
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {collectVenueJournal} from './export-venue-return.mjs';
import {signVenueReturnSnapshot,encryptVenueReturn,openVenueReturn} from './venue-return-package.mjs';
import {applyCompleteVenueJournal} from './full-return-apply.mjs';
import {postgresFullVenueAdapter} from '../../backend/scripts/venue-full-adapter.mjs';

const require=createRequire(import.meta.url);
const {PrismaPg}=require('@prisma/adapter-pg');
const {PrismaClient}=require('/app/dist/generated/prisma/client.js');
const {Client}=require('pg');
const stageId=process.env.VENUE_STAGE_ID;
const localUrl=process.env.DATABASE_URL;
const centralUrl=process.env.VENUE_CENTRAL_TEST_DATABASE_URL;
const STAFF_MODE=process.env.USD_VENUE_CI_STAFF_MODE;
if(process.env.USD_VENUE_LAN_MODE!=='true'
 ||!localUrl||!new URL(localUrl).pathname.startsWith('/usd_venue')
 ||new URL(localUrl).pathname.includes('usd_venue_ci')
 ||!centralUrl||new URL(centralUrl).pathname!=='/usd_venue_ci'
 ||new URL(centralUrl).hostname!=='db'
 ||!process.env.VENUE_DB_ROOT_PASSWORD)
 throw Error('CI ONLY: independent local and central disposable venue databases required');
const local=new PrismaClient({adapter:new PrismaPg({connectionString:localUrl})});
const central=new PrismaClient({adapter:new PrismaPg({connectionString:centralUrl})});
const pgClient=new Client({connectionString:centralUrl});
const api='http://api:3000';
const byId=items=>new Map(items.map(item=>[item.id,item]));
const numberOf=value=>Number(value);
const stableSha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function call(path,token,body,method='POST'){
 const response=await fetch(api+path,{
  method,headers:{'Content-Type':'application/json',
   ...(token?{Authorization:'Bearer '+token}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(30000),
 });
 const payload=await response.json().catch(()=>null);
 if(!response.ok)throw Error(method+' '+path+' HTTP '+response.status+': '+
  JSON.stringify(payload).slice(0,650));
 return payload;
}
async function copyRows(table,column,ids){
 if(!ids.length)return;
 const rows=await local.$queryRawUnsafe(
  'SELECT to_jsonb(t) AS doc FROM "'+table+'" t WHERE t."'+column+
  '"=ANY($1::text[]) ORDER BY 1',[...ids]);
 for(const {doc} of rows){
  await central.$executeRawUnsafe(
   'INSERT INTO "'+table+'" SELECT * FROM jsonb_populate_record(NULL::"'+
    table+'",$1::jsonb)',JSON.stringify(doc));
 }
 return rows.map(r=>r.doc);
}
async function prepareOnlineBaseline(){
 assert.equal((await central.$queryRawUnsafe('SELECT current_database() AS n'))[0].n,
  'usd_venue_ci');
 assert.equal((await local.$queryRawUnsafe('SELECT current_database() AS n'))[0].n,
  'usd_venue');
 assert.equal(await central.stage.count(),0,'central test database must start empty');
 const stage=await local.stage.findUniqueOrThrow({where:{id:stageId}});
 const baseline=await local.auditLog.findFirst({
  where:{action:'VENUE_STAGE_PACKAGE_IMPORTED',entity:'Stage',entityId:stageId},
 });
 assert.match(baseline?.metadata?.sha256??'',/^[a-f0-9]{64}$/);
 await copyRows('Season','id',[stage.seasonId]);
 const stageClasses=await local.stageClass.findMany({
  where:{stageId},include:{class:{include:{direction:true}}},orderBy:{sortOrder:'asc'},
 });
 assert.equal(stageClasses.length,19);
 await copyRows('Direction','id',[...new Set(stageClasses.map(s=>s.class.directionId))]);
 await copyRows('Class','id',stageClasses.map(s=>s.classId));
 await copyRows('Stage','id',[stageId]);
 await copyRows('StageClass','stageId',[stageId]);
 const originals=await local.registration.findMany({
  where:{stageId,participantNumber:{in:[6,7]}},
 });
 assert.equal(originals.length,2,'seed must have two original online registrations');
 const people=[...new Set(originals.map(r=>r.participantId))];
 const cars=[...new Set(originals.map(r=>r.carId))];
 const versions=[...new Set(originals.map(r=>r.configurationVersionId))];
 await copyRows('Participant','id',people);
 await copyRows('Car','id',cars);
 const configs=await local.carConfiguration.findMany({where:{carId:{in:cars}}});
 await copyRows('CarConfiguration','id',configs.map(c=>c.id));
 await copyRows('CarConfigurationVersion','id',versions);
 for(const table of ['CarAudioComponent','CarAmplifier','CarHeadUnit','CarBattery','CarGenerator'])
  await copyRows(table,'versionId',versions);
 const amps=await local.carAmplifier.findMany({where:{versionId:{in:versions}}});
 await copyRows('CarAmplifierComponent','amplifierId',amps.map(a=>a.id));
 await copyRows('Registration','id',originals.map(r=>r.id));
 await copyRows('RegistrationNumber','registrationId',originals.map(r=>r.id));
 const originalsClasses=await local.registrationClass.findMany({
  where:{registrationId:{in:originals.map(r=>r.id)}},
 });
 await copyRows('RegistrationClass','registrationId',originals.map(r=>r.id));
 await copyRows('Inspection','registrationId',originals.map(r=>r.id));
 await copyRows('ParticipantStageInspection','participantId',people);
 await copyRows('RegistrationClassInspection','registrationClassId',
  originalsClasses.map(r=>r.id));
 assert.equal(await central.registration.count(),2);
 assert.equal(await central.result.count(),0);
 const survivor=await central.stage.create({
  data:{seasonId:stage.seasonId,stageNumber:8,name:'CI protected neighbor stage',
   date:new Date('2026-11-13T10:00:00.000Z'),status:'PUBLISHED'},
 });
 await central.stageClass.create({
  data:{stageId:survivor.id,classId:stageClasses[0].classId},
 });
 const nextReg=await central.registration.create({data:{
  stageId:survivor.id,participantId:originals[0].participantId,
  carId:originals[0].carId,configurationVersionId:originals[0].configurationVersionId,
  configurationSnapshot:{ciNeighbor:true},participantNumber:999,source:'IMPORT',
 }});
 const nextNumber=await central.registrationNumber.create({
  data:{stageId:survivor.id,registrationId:nextReg.id,number:999,isPrimary:true},
 });
 const nextClass=await central.registrationClass.create({
  data:{registrationId:nextReg.id,classId:stageClasses[0].classId,numberId:nextNumber.id},
 });
 await central.inspection.create({
  data:{registrationId:nextReg.id,status:'PASSED',checkedByName:'CI neighbor'},
 });
 const nextResult=await central.result.create({
  data:{registrationId:nextReg.id,registrationClassId:nextClass.id,
   value:166.333,unit:'DB',isBest:true},
 });
 return {baseline:baseline.metadata.sha256,stageClasses,survivor,nextResult,
  baseOriginals:originals};
}

async function enterCompetitors(stageClasses){
 const classes=stageClasses.slice().sort((a,b)=>a.sortOrder-b.sortOrder);
 const regular=classes.slice(0,5);
 const bass=classes.slice(16,19);
 assert.equal(regular.length,5);assert.equal(bass.length,3);
 assert.equal(new Set(regular.map(c=>c.class.directionId)).size,5,
  'five primary class directions must be independent');
 assert.ok(bass.every(c=>c.class.direction.name==='BassRace'));
 const admin=await call('/auth/login',null,{
  email:STAFF_MODE==='existing'?'real-admin@usd.test':'operator1@venue.invalid',
  password:'Venue-Admin!Strong#17',
 });
 const judge=await call('/auth/login',null,{
  email:STAFF_MODE==='existing'?'real-judge@usd.test':'judge-01@venue.invalid',
  password:'Venue-Judge!Strong#17',
 });
 const token=admin.accessToken,judgeToken=judge.accessToken;
 const ids=[];
 let totalRegular=0,totalBass=0,totalClassInspections=0,totalResults=0,
  corrections=0,failedInspections=0;
 for(let i=0;i<100;i++){
  const plate='А'+String(300+i).padStart(3,'0')+'ВС77';
  const profile=await call('/registrations/on-site/profile',token,{
   lastName:'ТестСтресс'+String(i).padStart(3,'0'),
   firstName:'Площадочный',brand:'Lada',model:'Vesta',
   registrationCountry:'RU',registrationNumber:plate,
   privacyConsent:true,termsAccepted:true,
  });
  const regularCount=1+i%5,bassCount=1+i%3;
  const selected=[
   ...regular.slice(0,regularCount).map(r=>r.classId),
   ...bass.slice(0,bassCount).map(r=>r.classId),
  ];
  const registration=await call('/registrations',token,{
   stageId,participantId:profile.participantId,carId:profile.carId,
   classIds:selected,source:'ON_SITE',rulesAccepted:true,privacyConsent:true,
   termsAccepted:true,protocolConsent:true,
  });
  const failed=i%10===9;
  const inspection=await call('/inspections',token,{
   registrationId:registration.id,status:failed?'FAILED':'PASSED',
   ...(failed?{notes:'Тестовый отказ инспекции: проверка оборудования '+i}:{}),
  });
  assert.ok(inspection.id);
  const rc=await local.registrationClass.findMany({
   where:{registrationId:registration.id},include:{number:true,class:true},
  });
  const stickers=await local.registrationNumber.findMany({
   where:{registrationId:registration.id},orderBy:{number:'asc'},
  });
  assert.equal(rc.length,selected.length);
  assert.equal(stickers.length,1+bassCount-(regularCount<5?1:0),
   'BassRace numbering must keep at most five classes on primary sticker');
  const primary=stickers.find(n=>n.isPrimary);
  assert.ok(primary,'primary number missing');
  const bassNumbers=new Set();
  for(const cls of rc){
   const isBass=bass.some(b=>b.classId===cls.classId);
   if(!isBass)assert.equal(cls.numberId,primary.id);
   else bassNumbers.add(cls.numberId);
   // Only BassRace has per-class inspections; main classes use the vehicle.
   if(isBass){
    const response=await call('/inspections/class',token,{
     registrationClassId:cls.id,status:failed?'FAILED':'PASSED',
     ...(failed?{notes:'Отказ BassRace в классе '+cls.classId}:{}),
    });
    assert.ok(response.id);
    totalClassInspections++;
   }
   if(!failed){
    const value=145+(i%20)/10+selected.indexOf(cls.classId)/100;
    const measured=await call('/results',judgeToken,{
     registrationId:registration.id,registrationClassId:cls.id,
     value:Number(value.toFixed(3)),confirmed:true,
    });
    assert.ok(measured.id);
    totalResults++;
    if(i%10===0&&cls.classId===selected[0]){
     const updated=await call('/results/'+measured.id,token,{
      value:Number((value+0.555).toFixed(3)),
     },'PATCH');
     assert.ok(updated.id);corrections++;
    }
   }
  }
  // The sixth class is not silently forced onto the same sticker: at full
  // primary capacity every BassRace class is assigned its OWN number.
  if(regularCount===5)
   assert.ok([...bassNumbers].every(id=>id!==primary.id));
  const counted=rc.filter(row=>row.numberId===primary.id).length;
  assert.ok(counted<=5);
  totalRegular+=regularCount;totalBass+=bassCount;
  if(failed)failedInspections++;
  ids.push({registrationId:registration.id,participantId:profile.participantId,
   carId:profile.carId,inspectionId:inspection.id,plate,
   regularCount,bassCount,failed});
  if((i+1)%25===0)console.log('USD ROUNDTRIP LAN PROGRESS '+(i+1)+'/100');
 }
 assert.equal(ids.length,100);
 assert.equal(totalRegular,300);
 assert.equal(totalBass,199);
 assert.equal(totalClassInspections,199);
 assert.equal(failedInspections,10);
 return {ids,totalRegular,totalBass,totalClassInspections,totalResults,corrections,
  failedInspections};
}

async function checkImported(expected,context){
 const registrations=await central.registration.findMany({
  where:{id:{in:expected.ids.map(i=>i.registrationId)}},
  include:{numbers:true,classes:true,inspection:true,results:true},
 });
 assert.equal(registrations.length,100,'100 registrations must return to central');
 const index=byId(registrations);
 let regular=0,bass=0,scores=0;
 for(const expectedRow of expected.ids){
  const online=index.get(expectedRow.registrationId);
  assert.ok(online,'missing registration '+expectedRow.registrationId);
  assert.equal(online.participantId,expectedRow.participantId);
  assert.equal(online.carId,expectedRow.carId);
  assert.equal(online.inspection?.status,expectedRow.failed?'FAILED':'PASSED');
  assert.equal(online.classes.length,expectedRow.regularCount+expectedRow.bassCount);
  assert.equal(online.numbers.length,
   1+expectedRow.bassCount-(expectedRow.regularCount<5?1:0));
  const localClasses=await local.registrationClass.findMany({
   where:{registrationId:expectedRow.registrationId},
  });
  const localNumberIds=new Set(localClasses.map(row=>row.numberId));
  assert.deepEqual(new Set(online.classes.map(row=>row.numberId)),localNumberIds);
  for(const localClass of localClasses){
   const onlineClass=online.classes.find(r=>r.id===localClass.id);
   assert.equal(onlineClass?.classId,localClass.classId);
  }
  const localResults=await local.result.findMany({
   where:{registrationId:expectedRow.registrationId},
  });
  assert.equal(online.results.length,localResults.length);
  for(const row of localResults){
   const onlineResult=online.results.find(r=>r.id===row.id);
   assert.ok(onlineResult,'missing LAN result '+row.id);
   assert.equal(numberOf(onlineResult.value),numberOf(row.value));
   scores++;
  }
  regular+=expectedRow.regularCount;bass+=expectedRow.bassCount;
 }
 assert.equal(regular,expected.totalRegular);
 assert.equal(bass,expected.totalBass);
 assert.equal(scores,expected.totalResults);
 const localClassInspections=await local.registrationClassInspection.findMany({
  where:{registrationClassId:{in:registrations.flatMap(r=>r.classes.map(c=>c.id))}},
 });
 const centralClassInspections=await central.registrationClassInspection.findMany({
  where:{registrationClassId:{in:registrations.flatMap(r=>r.classes.map(c=>c.id))}},
 });
 assert.equal(centralClassInspections.length,expected.totalClassInspections);
 assert.deepEqual(
  centralClassInspections.map(c=>[c.id,c.status]).sort((a,b)=>a[0].localeCompare(b[0])),
  localClassInspections.map(c=>[c.id,c.status]).sort((a,b)=>a[0].localeCompare(b[0])),
 );
 const neighbor=await central.result.findUniqueOrThrow({
  where:{id:context.nextResult.id},
 });
 assert.equal(numberOf(neighbor.value),166.333,'another stage result must survive return');
 assert.equal(await central.stage.count(),2,'another stage must remain untouched');
 return {registrations:registrations.length,inspections:registrations.filter(r=>r.inspection).length,
  classInspections:centralClassInspections.length,regularClasses:regular,
  bassRaceClasses:bass,results:scores};
}

try{
 await local.$connect();await central.$connect();await pgClient.connect();
 const context=await prepareOnlineBaseline();
 const expected=await enterCompetitors(context.stageClasses);
 const snapshot=await collectVenueJournal(local,process.env);
 assert.ok(snapshot.eventCount>1000,'real append-only venue journal must include class/number/inspection writes');
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const privatePem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
 const publicPem=publicKey.export({type:'spki',format:'pem'}).toString();
 const fingerprint=createHash('sha256')
  .update(publicKey.export({type:'spki',format:'der'})).digest('hex');
 const secret='Usd-Venue-Roundtrip!2026';
 const encrypted=encryptVenueReturn(signVenueReturnSnapshot(snapshot,privatePem),secret);
 const ciphertext=JSON.stringify(encrypted);
 assert.ok(!ciphertext.includes(expected.ids[0].plate),'private plates must be encrypted');
 assert.ok(!ciphertext.includes('ТестСтресс'),'participant names must be encrypted');
 const opened=openVenueReturn(encrypted,secret,publicPem,{
  stageId,baselineSha256:context.baseline,
  trustedFingerprint:fingerprint,now:Date.now(),
 });
 assert.equal(opened.eventCount,snapshot.eventCount);
 assert.equal(opened.journalEndHash,snapshot.journalEndHash);
 assert.throws(()=>openVenueReturn(encrypted,'Wrong-Passphrase!2026',publicPem,{
  stageId,baselineSha256:context.baseline,trustedFingerprint:fingerprint,now:Date.now(),
 }));
 const adapter=postgresFullVenueAdapter(pgClient);
 const options={stageId,baselineSha256:context.baseline,operator:'CI operator',apply:false};
 const preview=await applyCompleteVenueJournal(opened,adapter,options);
 assert.equal(preview.readyEvents,opened.eventCount);
 assert.equal(await central.registration.count(),3,
  'dry-run must never insert 100 competitors');
 const applied=await applyCompleteVenueJournal(opened,adapter,{...options,apply:true});
 assert.equal(applied.appliedEvents,opened.eventCount);
 const report=await checkImported(expected,context);
 const replay=await applyCompleteVenueJournal(opened,adapter,{...options,apply:true});
 assert.equal(replay.alreadyApplied,true,'second import must be idempotent');
 assert.equal(replay.appliedEvents,0);
 assert.deepEqual(await checkImported(expected,context),report);
 console.log('USD VENUE 100 ROUNDTRIP PASS '+JSON.stringify({
  ...report,failedInspections:expected.failedInspections,correctedResults:expected.corrections,
  journalEvents:opened.eventCount,encryptedBytes:Buffer.byteLength(ciphertext),
  dryRun:preview.readyEvents,replayed:true,neighborProtected:true,
  signedStageDownloadedAndImported:true,databaseIsolation:['usd_venue','usd_venue_ci'],
 }));
}catch(e){
 console.error('USD VENUE 100 ROUNDTRIP FAILED:',e?.stack??String(e));
 process.exitCode=1;
}finally{
 await pgClient.end().catch(()=>{});
 await local.$disconnect().catch(()=>{});
 await central.$disconnect().catch(()=>{});
}
