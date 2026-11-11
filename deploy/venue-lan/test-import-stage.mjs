import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {planVenueStageImport,applyVenueStageImport} from './import-stage.mjs';

const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const publicPem=publicKey.export({type:'spki',format:'pem'}).toString();
const uuid={
 stage:'c510f672-79f7-44eb-8173-2a8ff94b1c0e',
 season:'a510f672-79f7-44eb-8173-2a8ff94b1c0e',
 direction:'b510f672-79f7-44eb-8173-2a8ff94b1c0e',
 cls:'dfe5a37d-4d3c-40d8-a7b4-70b509012346',
 stageClass:'d510f672-79f7-44eb-8173-2a8ff94b1c0e',
 person:'e510f672-79f7-44eb-8173-2a8ff94b1c0e',
 car:'f510f672-79f7-44eb-8173-2a8ff94b1c0e',
 version:'a610f672-79f7-44eb-8173-2a8ff94b1c0e',
 reg:'cf0328c0-609c-4503-b92b-3c058d72372a',
 number:'7f163be4-541f-4f94-a7e0-b5de8b3a6b4e',
 regClass:'5a4b83a1-51f5-4c2f-81c7-a01b78bcb51f',
 result:'b610f672-79f7-44eb-8173-2a8ff94b1c0e',
 inspection:'c610f672-79f7-44eb-8173-2a8ff94b1c0e',
 classInspection:'d610f672-79f7-44eb-8173-2a8ff94b1c0e',
 stageInspection:'e610f672-79f7-44eb-8173-2a8ff94b1c0e',
};
const now=Date.parse('2026-11-11T15:00:00.000Z');
const env={
 USD_VENUE_LAN_MODE:'true',VENUE_STAGE_ID:uuid.stage,
 DATABASE_URL:'postgresql://usd_venue:venue-password@db:5432/usd_venue?schema=public',
 VENUE_DB_NAME:'usd_venue',VENUE_DB_USER:'usd_venue',VENUE_DB_PASSWORD:'venue-password',
};
const snapshot=()=>({
 format:1,purpose:'USD_VENUE_STAGE_READONLY',stageId:uuid.stage,
 generatedAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+7200000).toISOString(),
 stage:{
  id:uuid.stage,seasonId:uuid.season,stageNumber:7,name:'USD Тюмень',city:'Тюмень',
  date:'2026-11-11T00:00:00.000Z',venue:'Площадка',address:null,status:'PUBLISHED',
  registrationOpen:true,registrationStartsAt:null,registrationEndsAt:null,
  resultsPublishedAt:null,rulesSnapshot:{version:'2026'},
  season:{id:uuid.season,year:2026,name:'USD 2026'},
  stageClasses:[{id:uuid.stageClass,stageId:uuid.stage,classId:uuid.cls,sortOrder:0,
   isActive:true,participantLimit:null,customName:null,description:null,settings:null,
   class:{id:uuid.cls,code:'L20',name:'Limited 2.0',unit:'DB',sortOrder:0,isActive:true,
    direction:{id:uuid.direction,name:'SPL',sortOrder:0,isActive:true}}}],
 },
 registrations:[{id:uuid.reg,stageId:uuid.stage,participantId:uuid.person,carId:uuid.car,
  configurationVersionId:uuid.version,configurationSnapshot:{venue:true},participantNumber:6,
  source:'ON_SITE',status:'ACTIVE',registeredAt:'2026-11-10T12:00:00.000Z',
  teamIdAtInspection:null,teamNameAtInspection:null,
  participant:{id:uuid.person,firstName:'Иван',lastName:'Иванов',middleName:null,city:'Тюмень',team:null},
  car:{id:uuid.car,participantId:uuid.person,brand:'Lada',model:'Vesta',registrationCountry:'RU',
   registrationNumber:'А123ВС55',color:null},
  numbers:[{id:uuid.number,number:6,isPrimary:true}],
  classes:[{id:uuid.regClass,classId:uuid.cls,numberId:uuid.number,
   class:{id:uuid.cls,code:'L20',name:'Limited 2.0',directionId:uuid.direction},
   inspection:{id:uuid.classInspection,status:'PASSED',checkedAt:'2026-11-11T10:00:00Z',notes:null}}],
  inspection:{id:uuid.inspection,status:'PASSED',checkedAt:'2026-11-11T09:00:00Z',notes:null},
  stageInspection:{id:uuid.stageInspection,participantId:uuid.person,stageId:uuid.stage,
   status:'PASSED',checkedAt:'2026-11-11T09:00:00Z',notes:null},
  results:[{id:uuid.result,registrationClassId:uuid.regClass,value:'151.750',unit:'DB',
   place:1,isBest:false,verificationStatus:'NOT_REQUIRED'}],
 }],
});
const signed=(data=snapshot())=>{
 const bytes=Buffer.from(JSON.stringify(data));
 const hash=b=>createHash('sha256').update(b).digest('hex');
 return {snapshot:data,integrity:{algorithm:'Ed25519',sha256:hash(bytes),
  signature:sign(null,bytes,privateKey).toString('base64url'),
  publicKeyFingerprint:hash(publicKey.export({type:'spki',format:'der'}))}};
};

test('dry-run validates signed scoped package without touching any database',()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 assert.deepEqual(plan.summary,{stageId:uuid.stage,registrations:1,classes:1,results:1});
 assert.equal(plan.packageHash.length,64);
 assert.equal(plan.registrations[0].car.registrationNumber,'А123ВС55');
});
test('reject invalid origin, wrong key, expired package, wrong stage and external database',()=>{
 const p=signed();
 assert.throws(()=>planVenueStageImport(p,generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString(),env,now),/подпись/);
 assert.throws(()=>planVenueStageImport(p,publicPem,env,now+72*60*60*1000),/просрочен/);
 assert.throws(()=>planVenueStageImport(p,publicPem,{...env,VENUE_STAGE_ID:uuid.season},now),/этап/);
 assert.throws(()=>planVenueStageImport(p,publicPem,{...env,USD_VENUE_LAN_MODE:'false'},now),/площадк/);
 assert.throws(()=>planVenueStageImport(p,publicPem,{...env,DATABASE_URL:'postgresql://usd:prod@production.example:5432/usd'},now),/баз/);
});
test('reject signed but structurally dangerous package BEFORE any write',()=>{
 const mismatch=snapshot();mismatch.registrations[0].configurationVersionId='BAD';
 assert.throws(()=>planVenueStageImport(signed(mismatch),publicPem,env,now),/конфигурац/);
 const wrongClass=snapshot();wrongClass.stage.stageClasses[0].class.direction.id='WRONG';
 assert.throws(()=>planVenueStageImport(signed(wrongClass),publicPem,env,now),/UUID/);
 const brokenInspection=snapshot();brokenInspection.registrations[0].stageInspection.participantId=uuid.season;
 assert.throws(()=>planVenueStageImport(signed(brokenInspection),publicPem,env,now),/инспекц/);
});
function mockDb(){
 const log=[];
 const tx={};
 for(const name of ['stage','season','direction','class','stageClass','participant','car','carConfiguration','carConfigurationVersion',
  'registration','registrationNumber','registrationClass','inspection','participantStageInspection','registrationClassInspection','result','auditLog']){
  tx[name]={
   count:async()=>0,
   create:async value=>{log.push({model:name,data:value.data});return {id:value.data?.id??uuid.version}},
   update:async value=>{log.push({model:name,update:value.data});return {}},
  };
 }
 tx.$executeRawUnsafe=async sql=>{assert.match(sql,/advisory_xact_lock/);return 1};
 const db={$transaction:async(callback,opts)=>{assert.equal(opts.isolationLevel,'Serializable');return callback(tx)}};
 return {tx,db,log};
}
test('transactionally inserts the signed one-stage roster in FK order and logs a digest only',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {db,log}=mockDb();
 const result=await applyVenueStageImport(plan,db);
 assert.equal(result.stageId,uuid.stage);
 assert.deepEqual(log.map(x=>x.model),[
  'season','direction','class','stage','stageClass','participant','car',
  'carConfiguration','carConfigurationVersion','registration','registrationNumber','registrationClass',
  'inspection','participantStageInspection','registration','registrationClassInspection','result','auditLog'
 ]);
 assert.equal(log.find(x=>x.model==='result').data.value,'151.750');
 assert.equal(log.find(x=>x.model==='auditLog').data.metadata.sha256,plan.packageHash);
 assert.ok(!JSON.stringify(log.find(x=>x.model==='auditLog')).includes('Иванов'));
});
test('a nonempty local event database refuses to apply or overwrite participants/results',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {tx,db,log}=mockDb();
 tx.stage.count=async()=>1;
 await assert.rejects(()=>applyVenueStageImport(plan,db),/не пуста/);
 assert.equal(log.length,0);
});
test('write errors are surfaced, never reported as successful or silently skipped',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {tx,db,log}=mockDb();
 tx.result.create=async()=>{throw new Error('simulated database crash')};
 await assert.rejects(()=>applyVenueStageImport(plan,db),/simulated database crash/);
 assert.equal(log.some(x=>x.model==='auditLog'),false);
});
