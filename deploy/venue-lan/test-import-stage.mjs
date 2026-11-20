import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {planVenueStageImport,applyVenueStageImport} from './import-stage.mjs';
import * as importer from './import-stage.mjs';

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
 VENUE_SIGNING_KEY_FINGERPRINT:createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex'),
};
const snapshot=()=>({
 format:1,purpose:'USD_VENUE_STAGE_READONLY',stageId:uuid.stage,
 generatedAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+7200000).toISOString(),
 stage:{
  id:uuid.stage,seasonId:uuid.season,stageNumber:7,name:'USD Тюмень',city:'Тюмень',
  date:'2026-11-11T00:00:00.000Z',venue:'Площадка',address:null,status:'PUBLISHED',
  registrationOpen:true,registrationStartsAt:null,registrationEndsAt:null,
  resultsPublishedAt:null,rulesSnapshot:{version:'2026'},
  season:{id:uuid.season,year:2026,name:'USD 2026',status:'ACTIVE'},
  stageClasses:[{id:uuid.stageClass,stageId:uuid.stage,classId:uuid.cls,sortOrder:0,
   isActive:true,participantLimit:null,customName:null,description:null,settings:null,
   class:{id:uuid.cls,code:'L20',name:'Limited 2.0',unit:'DB',sortOrder:0,isActive:true,
    direction:{id:uuid.direction,name:'SPL',sortOrder:0,isActive:true}}}],
 },
 disqualifications:[],
 venuePolicy:{
  legal:{legalApproved:true,legalVersion:'7',ipName:'Организатор USD',privacyText:'Опубликованная политика USD',
   consentText:'Опубликованное согласие USD',termsText:'Опубликованные условия USD',
   operatorAddress:'Тестовый адрес',personalDataEmail:'data@example.org',
   documents:{officialProtocolConsent:{targetId:'legal-document-officialProtocolConsent-test',url:'https://example.org/official-protocol.docx',fileName:'Consent.docx',blocks:[{type:'paragraph',text:'Тестовое согласие'}]}}},
  contactEmail:'organizer@example.org',
  rulesPublished:{id:'rules-v7',blocks:[{type:'paragraph',text:'Правила этапа'}]},
 },
 registrations:[{id:uuid.reg,stageId:uuid.stage,participantId:uuid.person,carId:uuid.car,
  configurationVersionId:uuid.version,configurationSnapshot:{venue:true},participantNumber:6,
  source:'ON_SITE',status:'ACTIVE',registeredAt:'2026-11-10T12:00:00.000Z',
  teamIdAtInspection:null,teamNameAtInspection:null,
  participant:{id:uuid.person,firstName:'Иван',lastName:'Иванов',middleName:null,city:'Тюмень',team:null,isPublic:true},
  car:{id:uuid.car,participantId:uuid.person,brand:'Lada',model:'Vesta',registrationCountry:'RU',
   registrationNumber:'А123ВС55',color:null,isPublic:true,isActive:true},
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
 assert.throws(()=>planVenueStageImport(p,publicPem,{...env,VENUE_SIGNING_KEY_FINGERPRINT:'f'.repeat(64)},now),/отпечаток/);
 assert.throws(()=>planVenueStageImport(p,publicPem,{...env,USD_VENUE_LAN_MODE:'false'},now),/площадк/);
 assert.throws(()=>planVenueStageImport(p,publicPem,{...env,DATABASE_URL:'postgresql://usd:prod@production.example:5432/usd'},now),/баз/);
});
test('reject signed but structurally dangerous package BEFORE any write',()=>{
 const mismatch=snapshot();mismatch.registrations[0].configurationVersionId='BAD';
 assert.throws(()=>planVenueStageImport(signed(mismatch),publicPem,env,now),/конфигурац/);
 const wrongClass=snapshot();wrongClass.stage.stageClasses[0].class.direction.id='WRONG';
 assert.throws(()=>planVenueStageImport(signed(wrongClass),publicPem,env,now),/UUID/);
 const invalidBan=snapshot();invalidBan.disqualifications=[{id:uuid.person,scope:'FORMAT'}];
 assert.throws(()=>planVenueStageImport(signed(invalidBan),publicPem,env,now),/дисквалификац|запрет/i);
 const brokenInspection=snapshot();brokenInspection.registrations[0].stageInspection.participantId=uuid.season;
 assert.throws(()=>planVenueStageImport(signed(brokenInspection),publicPem,env,now),/инспекц/);
});
function mockDb(){
 const log=[];
 const tx={};
 for(const name of ['stage','season','direction','class','stageClass','siteSettings','participant','car','carConfiguration','carConfigurationVersion',
  'registration','registrationNumber','registrationClass','inspection','participantStageInspection','registrationClassInspection','result','auditLog']){
  tx[name]={
   count:async()=>0,
   findUnique:async()=>null,
   create:async value=>{log.push({model:name,data:value.data});return {id:value.data?.id??uuid.version}},
   createMany:async value=>{for(const item of value.data)log.push({model:name,data:item});return {count:value.data.length}},
   update:async value=>{log.push({model:name,update:value.data});return {}},
  };
 }
 tx.$executeRawUnsafe=async sql=>{assert.equal(sql.trimStart().toUpperCase().startsWith('SELECT '),false);return 1};
 tx.$queryRawUnsafe=async sql=>sql.includes('pg_advisory_xact_lock')?[{acquired:1}]:[{rolsuper:false}];
 const db={$transaction:async(callback,opts)=>{assert.equal(opts.isolationLevel,'Serializable');return callback(tx)}};
 return {tx,db,log};
}
test('apply must not reorder signed stage classes and invalidate its checksum on replay',async()=>{
 const data=snapshot();
 const extra=structuredClone(data.stage.stageClasses[0]);
 extra.id='a1111111-1111-4111-8111-111111111111';
 extra.classId='a2222222-2222-4222-8222-222222222222';
 extra.class.id=extra.classId;extra.class.code='CI_SECOND';extra.class.name='Extra';
 data.stage.stageClasses.push(extra);
 const packageObject=signed(data),original=JSON.stringify(packageObject.snapshot);
 const plan=planVenueStageImport(packageObject,publicPem,env,now);
 await applyVenueStageImport(plan,mockDb().db);
 assert.equal(JSON.stringify(packageObject.snapshot),original,'signed class order is immutable');
 assert.equal(planVenueStageImport(packageObject,publicPem,env,now).summary.classes,2);
});

test('full signed historical roster uses bounded bulk inserts, not one Prisma query per profile and car',async()=>{
 const data=snapshot();
 data.participantDirectory=Array.from({length:750},(_,index)=>{
  const id=randomUUID();
  return {id,firstName:'Исторический',lastName:'Профиль '+index,middleName:null,
   city:null,team:null,isPublic:false,
   cars:[{id:randomUUID(),participantId:id,brand:'Lada',model:'',registrationCountry:'RU',
    registrationNumber:'',color:null,isPublic:false,isActive:false}]};
 });
 const plan=planVenueStageImport(signed(data),publicPem,env,now);
 const {db,tx}=mockDb();
 const bulkCalls=[];
 tx.participant.createMany=async args=>{bulkCalls.push({model:'participant',rows:args.data.length});return {count:args.data.length}};
 tx.car.createMany=async args=>{bulkCalls.push({model:'car',rows:args.data.length});return {count:args.data.length}};
 await applyVenueStageImport(plan,db);
 assert.equal(bulkCalls.filter(c=>c.model==='participant').reduce((n,c)=>n+c.rows,0),751);
 assert.equal(bulkCalls.filter(c=>c.model==='car').reduce((n,c)=>n+c.rows,0),751);
 assert.ok(bulkCalls.every(c=>c.rows<=250),'bounded batches avoid oversized PostgreSQL bind payloads');
 assert.ok(bulkCalls.length<=8,'initial import must scale to the entire signed directory');
});

test('fresh stage with approved intake cannot install without an explicit signed ban list',async()=>{
 const data=snapshot();delete data.disqualifications;
 const plan=planVenueStageImport(signed(data),publicPem,env,now);
 const {db,log}=mockDb();
 await assert.rejects(()=>applyVenueStageImport(plan,db),/дисквалификац|запрет/i);
 assert.equal(log.length,0);
});
test('transactionally inserts the signed one-stage roster in FK order and logs a digest only',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {db,log}=mockDb();
 const result=await applyVenueStageImport(plan,db);
 assert.equal(result.stageId,uuid.stage);
 assert.deepEqual(log.map(x=>x.model),[
  'season','direction','class','stage','stageClass','siteSettings','participant','car',
  'carConfiguration','carConfigurationVersion','registration','registrationNumber','registrationClass',
  'inspection','participantStageInspection','registration','registrationClassInspection','result','auditLog'
 ]);
 assert.equal(log.find(x=>x.model==='result').data.value,'151.750');
 assert.equal(log.find(x=>x.model==='season').data.status,'ACTIVE');
 const venueSettings=log.find(x=>x.model==='siteSettings').data;
 assert.equal(venueSettings.legal.legalVersion,'7');
 assert.equal(venueSettings.contacts.email,'organizer@example.org');
 assert.equal(venueSettings.registration.rulesDocument.published.id,'rules-v7');
 assert.equal(venueSettings.registration.rulesDocument.draft,undefined);
 assert.equal(log.find(x=>x.model==='participant').data.isPublic,true);
 assert.equal(log.find(x=>x.model==='car').data.isPublic,true);
 assert.equal(log.find(x=>x.model==='auditLog').data.metadata.sha256,plan.packageHash);
 assert.ok(!JSON.stringify(log.find(x=>x.model==='auditLog')).includes('Иванов'));
});
test('missing privacy flags in old signed exports are imported hidden, never made public by defaults',async()=>{
 const data=snapshot();delete data.registrations[0].participant.isPublic;
 delete data.registrations[0].car.isPublic;delete data.registrations[0].car.isActive;
 const plan=planVenueStageImport(signed(data),publicPem,env,now);
 const {db,log}=mockDb();await applyVenueStageImport(plan,db);
 assert.equal(log.find(x=>x.model==='participant').data.isPublic,false);
 assert.equal(log.find(x=>x.model==='car').data.isPublic,false);
 assert.equal(log.find(x=>x.model==='car').data.isActive,false);
});
test('no approved rules or contact in signed package cannot fabricate legal approval',()=>{
 const data=snapshot();
 data.venuePolicy.legal.legalApproved=false;
 assert.throws(()=>planVenueStageImport(signed(data),publicPem,env,now),/документ|соглас|legal/i);
 data.venuePolicy.legal.legalApproved=true;
 data.venuePolicy.contactEmail='';
 assert.throws(()=>planVenueStageImport(signed(data),publicPem,env,now),/контакт|email|юрид/i);
});
test('a legacy signed package without venue legal remains read-only and season draft',async()=>{
 const data=snapshot();delete data.venuePolicy;delete data.stage.season.status;
 const plan=planVenueStageImport(signed(data),publicPem,env,now);
 const {db,log}=mockDb();await applyVenueStageImport(plan,db);
 assert.equal(log.find(x=>x.model==='siteSettings'),undefined);
 assert.equal(log.find(x=>x.model==='season').data.status,'DRAFT');
});
test('preseeded migration SiteSettings preserves component catalogs and gains only signed legal',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {db,tx,log}=mockDb();
 tx.siteSettings.count=async()=>1;
 tx.siteSettings.findUnique=async()=>({
  legal:{},contacts:{},registration:{emailTemplates:['seeded']},
 });
 await applyVenueStageImport(plan,db);
 const changed=log.find(x=>x.model==='siteSettings');
 assert.ok(changed?.update);
 assert.equal(changed.update.registration.rulesDocument.published.id,'rules-v7');
 assert.deepEqual(changed.update.registration.emailTemplates,['seeded']);
 assert.equal(log.filter(x=>x.model==='siteSettings').length,1);
});
test('a pre-approved local legal policy cannot be overwritten by another signed stage',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {db,tx,log}=mockDb();
 tx.siteSettings.count=async()=>1;
 tx.siteSettings.findUnique=async()=>({legal:{legalApproved:true}});
 await assert.rejects(()=>applyVenueStageImport(plan,db),/перезапис/);
 assert.equal(log.some(x=>x.model==='siteSettings'),false);
});
test('a nonempty local event database refuses to apply or overwrite participants/results',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {tx,db,log}=mockDb();
 tx.stage.count=async()=>1;
 await assert.rejects(()=>applyVenueStageImport(plan,db),/не пуста/);
 assert.equal(log.length,0);
});
test('old unsafe database running as superuser is refused before import',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {tx,db,log}=mockDb();
 tx.$queryRawUnsafe=async()=>[{rolsuper:true}];
 await assert.rejects(()=>applyVenueStageImport(plan,db),/superuser/);
 assert.equal(log.length,0);
});
test('write errors are surfaced, never reported as successful or silently skipped',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {tx,db,log}=mockDb();
 tx.result.create=async()=>{throw new Error('simulated database crash')};
 await assert.rejects(()=>applyVenueStageImport(plan,db),/simulated database crash/);
 assert.equal(log.some(x=>x.model==='auditLog'),false);
});

 test('retained import appends a different stage and preserves shared identities',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {tx,db,log}=mockDb();
 tx.stage.count=async()=>2;
 tx.$queryRawUnsafe=async sql=>sql.includes('pg_roles')?[{rolsuper:true,name:'usd_venue_root'}]:[];
 tx.$executeRawUnsafe=async()=>1;
 tx.auditLog.findFirst=async()=>null;
 tx.season.findUnique=async()=>({id:uuid.season});
 tx.direction.findUnique=async()=>({id:uuid.direction});
 tx.class.findUnique=async()=>({id:uuid.cls,directionId:uuid.direction});
 tx.participant.findUnique=async()=>({id:uuid.person});
 tx.car.findUnique=async()=>({id:uuid.car,participantId:uuid.person});
 tx.carConfigurationVersion.findUnique=async()=>({id:uuid.version,configuration:{carId:uuid.car}});
 await applyVenueStageImport(plan,db,{shared:true});
 for(const name of ['season','direction','class','participant','car','carConfiguration','carConfigurationVersion'])
  assert.equal(log.some(x=>x.model===name),false,name+' must be reused');
 assert.equal(log.filter(x=>x.model==='stage').length,1);
 });
 test('retained identical import retry never overwrites judging',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {tx,db,log}=mockDb();
 tx.stage.count=async()=>2;
 tx.stage.findUnique=async()=>({id:uuid.stage});
 tx.auditLog.findFirst=async()=>({metadata:{sha256:plan.packageHash}});
 tx.$queryRawUnsafe=async()=>[{rolsuper:true,name:'usd_venue_root'}];
 tx.$executeRawUnsafe=async()=>1;
 const result=await applyVenueStageImport(plan,db,{shared:true});
 assert.equal(result.replayed,true);
 assert.equal(log.length,0);
 });

test('a retained stage without approved intake policy cannot inherit previous approval',async()=>{
 const data=snapshot();delete data.venuePolicy;
 const plan=planVenueStageImport(signed(data),publicPem,env,now);
 const {db,tx,log}=mockDb();
 tx.$queryRawUnsafe=async()=>[{rolsuper:true,name:'usd_venue_root'}];
 tx.$executeRawUnsafe=async()=>1;tx.auditLog.findFirst=async()=>null;
 tx.siteSettings.findUnique=async()=>({legal:{legalApproved:true},registration:{enabled:true}});
 await applyVenueStageImport(plan,db,{shared:true});
 const changed=log.find(x=>x.model==='siteSettings');
 assert.equal(changed.update.registration.enabled,false);
 assert.equal(changed.update.legal.legalApproved,false);
});

test('expired setup resumes only a matching package imported while it was valid',async()=>{
 assert.equal(typeof importer.planInstalledVenueStageImport,'function');
 const data=signed();
 const receipt={metadata:{sha256:data.integrity.sha256},createdAt:new Date(now)};
 const db={auditLog:{findFirst:async()=>receipt}};
 const late=now+4*86400000;
 const plan=await importer.planInstalledVenueStageImport(data,publicPem,env,db,late);
 assert.equal(plan.packageHash,data.integrity.sha256);
 for(const invalid of [null,{...receipt,metadata:{sha256:'0'.repeat(64)}},{...receipt,createdAt:new Date(late)}]){
  await assert.rejects(()=>importer.planInstalledVenueStageImport(data,publicPem,env,{auditLog:{findFirst:async()=>invalid}},late));
 }
 const committedLate={metadata:{sha256:data.integrity.sha256,verifiedAt:new Date(now).toISOString()},createdAt:new Date(late)};
 assert.equal((await importer.planInstalledVenueStageImport(data,publicPem,env,{auditLog:{findFirst:async()=>committedLate}},late)).packageHash,data.integrity.sha256);
 const tampered=structuredClone(data);tampered.snapshot.stage.name='different';
 await assert.rejects(()=>importer.planInstalledVenueStageImport(tampered,publicPem,env,db,late));
});

test('signed directory includes unregistered profiles and cars without inventing competition registrations',async()=>{
 const data=snapshot();
 data.participantDirectory=[
  {id:uuid.person,firstName:'Иван',lastName:'Иванов',middleName:null,city:'Тюмень',team:null,isPublic:true,
   cars:[{id:uuid.car,participantId:uuid.person,brand:'Lada',model:'Vesta',registrationCountry:'RU',registrationNumber:'А123ВС55',color:null,isPublic:true,isActive:true}]},
  {id:'ab84e950-8f7e-447b-87ab-18d92c36cad5',firstName:'Пётр',lastName:'Петров',middleName:null,city:'Омск',team:null,isPublic:false,
   cars:[{id:'a1a29ae7-73ea-42e6-b12c-594c687f8564',participantId:'ab84e950-8f7e-447b-87ab-18d92c36cad5',brand:'Toyota',model:'Camry',registrationCountry:'RU',registrationNumber:'А111ВС72',color:null,isPublic:false,isActive:true}]},
 ];
 const plan=planVenueStageImport(signed(data),publicPem,env,now);
 assert.equal(plan.participantDirectory.length,2);
 const {db,log}=mockDb();
 await applyVenueStageImport(plan,db);
 assert.equal(log.filter(x=>x.model==='participant').length,2);
 assert.equal(log.filter(x=>x.model==='car').length,2);
 assert.equal(log.filter(x=>x.model==='registration').length,2); // one create + one stage inspection link
 assert.equal(log.find(x=>x.model==='participant'&&x.data?.id===data.participantDirectory[1].id).data.isPublic,false);
 assert.equal(log.find(x=>x.model==='car'&&x.data?.id===data.participantDirectory[1].cars[0].id).data.isPublic,false);
});
test('signed directory rejects stale or duplicated participant IDs, foreign cars and personal contacts',()=>{
 const data=snapshot(),known={id:uuid.person,firstName:'Иван',lastName:'Иванов',middleName:null,city:'Тюмень',team:null,isPublic:true,cars:[]};
 data.participantDirectory=[known,known];
 assert.throws(()=>planVenueStageImport(signed(data),publicPem,env,now),/повтор|дубликат|участник/i);
 data.participantDirectory=[{...known,id:uuid.season,cars:[{id:uuid.car,participantId:uuid.person,brand:'Lada',model:'Vesta',registrationCountry:'RU',registrationNumber:'А123ВС55'}]}];
 assert.throws(()=>planVenueStageImport(signed(data),publicPem,env,now),/автомобил|принадлеж/i);
 data.participantDirectory=[{...known,phone:'+79990000000'}];
 assert.throws(()=>planVenueStageImport(signed(data),publicPem,env,now),/пол|запрещ|личн/i);
});
test('append-only directory refresh requires local root, matching stage and preserves registrations/results',async()=>{
 const data=snapshot();data.participantDirectory=[{
  id:'ab84e950-8f7e-447b-87ab-18d92c36cad5',firstName:'Пётр',lastName:'Петров',
  middleName:null,city:'Омск',team:null,isPublic:false,
  cars:[{id:'a1a29ae7-73ea-42e6-b12c-594c687f8564',participantId:'ab84e950-8f7e-447b-87ab-18d92c36cad5',brand:'Toyota',model:'Camry',registrationCountry:'RU',registrationNumber:'А111ВС72',color:null,isPublic:false,isActive:true}],
 }];
 const plan=planVenueStageImport(signed(data),publicPem,env,now);
 assert.equal(typeof importer.applyVenueParticipantDirectory,'function');
 const {tx,db,log}=mockDb();
 tx.$queryRawUnsafe=async sql=>sql.includes('current_user')?[{name:'usd_venue_root',rolsuper:true}]:[{stageId:uuid.stage}];
 tx.$executeRawUnsafe=async()=>1;
 tx.stage.findUnique=async()=>({id:uuid.stage});
 tx.auditLog.findFirst=async()=>({metadata:{sha256:'a'.repeat(64)}});
 tx.car.findMany=async()=>[];
 const refreshed=await importer.applyVenueParticipantDirectory(plan,db,{stageId:uuid.stage});
 assert.equal(refreshed.addedParticipants,1);
 assert.equal(refreshed.addedCars,1);
 assert.equal(log.some(x=>['registration','result'].includes(x.model)),false);
 const {db:untrusted,tx:tx2}=mockDb();
 tx2.stage.findUnique=async()=>({id:uuid.stage});
 await assert.rejects(()=>importer.applyVenueParticipantDirectory(plan,untrusted,{stageId:uuid.stage}),/root|установ|роль/i);
});

test('RED: signed full historical directory accepts imported car without plate without creating a new ID',async()=>{
 const p=snapshot();
 const personId='ab84e950-8f7e-447b-87ab-18d92c36cad5';
 const carId='a1a29ae7-73ea-42e6-b12c-594c687f8564';
 p.participantDirectory=[{id:personId,firstName:'Пётр',lastName:'Петров',middleName:null,
  city:null,team:null,isPublic:false,
  cars:[{id:carId,participantId:personId,brand:'Lada',model:'',registrationCountry:'RU',
   registrationNumber:'',color:null,isPublic:false,isActive:false}]}];
 const plan=planVenueStageImport(signed(p),publicPem,env,now);
 const {db,log}=mockDb();
 await applyVenueStageImport(plan,db);
 assert.equal(log.find(x=>x.model==='participant'&&x.data.id===personId).data.isPublic,false);
 const imported=log.find(x=>x.model==='car'&&x.data.id===carId).data;
 assert.equal(imported.registrationNumber,'');
 assert.equal(imported.participantId,personId);
 assert.equal(imported.isActive,false);
});
test('RED: signed historical roster can retain an incomplete display name without inventing a second USD ID',()=>{
 const p=snapshot(),id='ab84e950-8f7e-447b-87ab-18d92c36cad5';
 p.participantDirectory=[{id,firstName:'',lastName:'Исторический',middleName:null,
  city:null,team:null,isPublic:false,cars:[]}];
 assert.equal(planVenueStageImport(signed(p),publicPem,env,now).participantDirectory[0].id,id);
});
test('RED: new signed roster with blank vehicle plates cannot collide with existing blank plates on device',async()=>{
 const p=snapshot();
 const id='ab84e950-8f7e-447b-87ab-18d92c36cad5';
 const carId='a1a29ae7-73ea-42e6-b12c-594c687f8564';
 p.participantDirectory=[{id,firstName:'Пётр',lastName:'Петров',middleName:null,
  city:null,team:null,isPublic:false,
  cars:[{id:carId,participantId:id,brand:'Lada',model:'',registrationCountry:'RU',
   registrationNumber:'',color:null,isPublic:false,isActive:false}]}];
 const plan=planVenueStageImport(signed(p),publicPem,env,now);
 const {db,tx}=mockDb();
 tx.$queryRawUnsafe=async sql=>sql.includes('current_user')?[{name:'usd_venue_root',rolsuper:true}]:[{stageId:uuid.stage}];
 tx.$executeRawUnsafe=async()=>1;
 tx.stage.findUnique=async()=>({id:uuid.stage});
 tx.auditLog.findFirst=async()=>({metadata:{sha256:'a'.repeat(64)}});
 tx.car.findMany=async()=>[
  {id:'d1a29ae7-73ea-42e6-b12c-594c687f8564',participantId:uuid.person,registrationCountry:'RU',registrationNumber:''},
  {id:'d1a29ae7-73ea-42e6-b12c-594c687f8565',participantId:uuid.person,registrationCountry:'RU',registrationNumber:'  '},
 ];
 const done=await importer.applyVenueParticipantDirectory(plan,db,{stageId:uuid.stage});
 assert.equal(done.addedCars,1);
});


test('safe Windows database diagnostics distinguish role, schema, connection and SQL failures without secrets',()=>{
 const classify=importer.classifyVenueImportFailure;
 assert.equal(classify(new Error('Локальный API не имеет права работать с PostgreSQL superuser')),'DATABASE_UNSAFE_SUPERUSER_ROLE');
 for(const [code,expected] of [
  ['42501','DATABASE_PERMISSION_DENIED'],['42P01','DATABASE_SCHEMA_MISMATCH'],
  ['42703','DATABASE_SCHEMA_MISMATCH'],['28P01','DATABASE_AUTH_FAILED'],
  ['3D000','DATABASE_NOT_FOUND'],['08006','DATABASE_CONNECTION'],
 ]){
  const error=new Error('private postgres error: password=secret, Иванов');
  error.meta={code};error.venueImportPhase='DB_PRECHECK';
  assert.equal(classify(error),expected);
 }
 for(const [code,expected] of [['P2010','DATABASE_P2010_DB_PRECHECK'],['P2021','DATABASE_P2021_DB_PRECHECK'],
  ['P1017','DATABASE_P1017_DB_PRECHECK']]){
  const error=new Error('secret credentials');
  error.code=code;error.venueImportPhase='DB_PRECHECK';
  assert.equal(classify(error),expected);
 }
});

test('database failure reports a fixed import phase and safe Prisma code without participant names or SQL',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const {db,tx}=mockDb();
 tx.car.createMany=async()=>{const error=new Error('private row Иванов, secret /local-private');
  error.code='P2002';throw error};
 await assert.rejects(()=>applyVenueStageImport(plan,db),error=>{
  assert.equal(importer.classifyVenueImportFailure(error),'DATABASE_P2002_CARS');
  return true;
 });
 const unsafe=new Error('participant Иванов /local-private SELECT password');
 unsafe.code='P2002';unsafe.venueImportPhase='unsafe-dynamic-message';
 assert.equal(importer.classifyVenueImportFailure(unsafe),'DATABASE_P2002');
});
test('RED: startup refusal produces safe, PII-free reason codes for clock, historical roster, trust and database',()=>{
 assert.equal(importer.classifyVenueImportFailure(new Error('Пакет просрочен или время ноутбука неверно')),'PACKAGE_EXPIRED_OR_CLOCK');
 assert.equal(importer.classifyVenueImportFailure(new Error('Повтор или повреждение участника справочника')),'SIGNED_DIRECTORY_INVALID');
 assert.equal(importer.classifyVenueImportFailure(new Error('Доверенный отпечаток ключа подписи не совпадает с пакетом')),'SIGNATURE_OR_TRUST');
 assert.equal(importer.classifyVenueImportFailure(new Error('Адрес локальной базы данных недопустим')),'LOCAL_DATABASE_CONFIG');
 assert.equal(importer.classifyVenueImportFailure(new Error('SQL error: password=SECRET, Иванов, /local-private')),'UNCLASSIFIED');
});

test('RED: an unexpired but DIFFERENT signed stage packet cannot pass installed receipt verification',async()=>{
 const plan=planVenueStageImport(signed(),publicPem,env,now);
 const fake={stage:{findUnique:async()=>({id:uuid.stage})},auditLog:{findFirst:async()=>({metadata:{sha256:'0'.repeat(64)}})}};
 await assert.rejects(()=>importer.assertInstalledVenueStageReceipt(plan,fake),/исходн|receipt|хеш|пакет/i);
 const noReceipt={...fake,auditLog:{findFirst:async()=>null}};
 await assert.rejects(()=>importer.assertInstalledVenueStageReceipt(plan,noReceipt),/исходн|receipt|хеш|пакет/i);
 const matches={...fake,auditLog:{findFirst:async()=>({metadata:{sha256:plan.packageHash}})}};
 assert.equal((await importer.assertInstalledVenueStageReceipt(plan,matches)).packageHash,plan.packageHash);
 const gone={...matches,stage:{findUnique:async()=>null}};
 await assert.rejects(()=>importer.assertInstalledVenueStageReceipt(plan,gone),/этап|установ/i);
});


test('Prisma PostgreSQL SELECT contract: signed import and directory recovery never run SELECT via executeRaw',async()=>{
 const scenarios=['initial signed stage','retained signed stage','retained participant directory'];
 for(const scenario of scenarios){
  const payload=snapshot();
  if(scenario==='retained participant directory')payload.participantDirectory=[];
  const plan=planVenueStageImport(signed(payload),publicPem,env,now);
  const {tx,db}=mockDb();
  const readQueries=[];
  tx.$executeRawUnsafe=async sql=>{
   assert.equal(sql.trimStart().toUpperCase().startsWith('SELECT '),false,scenario+' must use Prisma queryRaw for row-producing SELECT');
   return 1;
  };
  tx.$queryRawUnsafe=async sql=>{
   readQueries.push(sql);
   if(sql.includes('pg_advisory_xact_lock')){assert.match(sql,/SELECT 1::int AS acquired FROM pg_advisory_xact_lock/);return [{acquired:1}];}
   if(sql.includes('pg_roles'))return [{name:scenario==='initial signed stage'?'usd_venue':'usd_venue_root',
    rolsuper:scenario!=='initial signed stage'}];
   if(sql.includes('set_config'))return [{set_config:'true'}];
   if(sql.includes('venue_private.active_stage'))return [{stageId:uuid.stage}];
   throw new Error('Unexpected SQL query in '+scenario);
  };
  if(scenario==='initial signed stage'){
   await applyVenueStageImport(plan,db);
  }else if(scenario==='retained signed stage'){
   await applyVenueStageImport(plan,db,{shared:true});
  }else{
   tx.stage.findUnique=async()=>({id:uuid.stage});
   tx.auditLog.findFirst=async options=>options.where.action==='VENUE_STAGE_PACKAGE_IMPORTED'
    ?{metadata:{sha256:plan.packageHash}}:null;
   tx.car.findMany=async()=>[];
   await importer.applyVenueParticipantDirectory(plan,db,{stageId:uuid.stage});
  }
  assert.equal(readQueries.filter(sql=>sql.includes('pg_advisory_xact_lock')).length,1,
   scenario+' must acquire advisory lock within transaction');
  if(scenario!=='initial signed stage')
   assert.equal(readQueries.filter(sql=>sql.includes('set_config')).length,1,
    scenario+' must configure signed importing in transaction');
 }
});
