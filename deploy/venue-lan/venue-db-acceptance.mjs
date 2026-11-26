#!/usr/bin/env node
/** Real, disposable PostgreSQL 18 + Nest API acceptance.
 * Run ONLY against CI-created isolated usd-venue Compose, never production.
 * Covers signed import, independent ADMIN/JUDGE, judge writes and LAN live.
 */
import {strict as assert} from 'node:assert';
import {createHash,createCipheriv,randomBytes,randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {planVenueStageImport,applyVenueStageImport,planInstalledVenueStageImport} from './import-stage.mjs';
import {planVenueStaff,provisionVenueStaff} from './provision-staff.mjs';
import {decryptExistingVenueStaff,applyExistingVenueStaff} from './provision-existing-staff.mjs';
import {collectVenueJournal} from './export-venue-return.mjs';
import {signVenueReturnSnapshot,encryptVenueReturn,openVenueReturn} from './venue-return-package.mjs';

const require=createRequire(import.meta.url);
const {PrismaPg}=require('@prisma/adapter-pg');
const {PrismaClient}=require('/app/dist/generated/prisma/client.js');
const bcrypt=require('bcrypt');
const ID={
 stage:'c510f672-79f7-44eb-8173-2a8ff94b1c0e',
 season:'a510f672-79f7-44eb-8173-2a8ff94b1c0e',
 direction:'b510f672-79f7-44eb-8173-2a8ff94b1c0e',
 klass:'dfe5a37d-4d3c-40d8-a7b4-70b509012346',
 stageClass:'d510f672-79f7-44eb-8173-2a8ff94b1c0e',
 person:'e510f672-79f7-44eb-8173-2a8ff94b1c0e',
 car:'f510f672-79f7-44eb-8173-2a8ff94b1c0e',
 config:'a610f672-79f7-44eb-8173-2a8ff94b1c0e',
 reg:'cf0328c0-609c-4503-b92b-3c058d72372a',
 number:'7f163be4-541f-4f94-a7e0-b5de8b3a6b4e',
 regClass:'5a4b83a1-51f5-4c2f-81c7-a01b78bcb51f',
 inspection:'c610f672-79f7-44eb-8173-2a8ff94b1c0e',
 banned:'f210f672-79f7-44eb-8173-2a8ff94b1c0e',
 bannedCar:'f310f672-79f7-44eb-8173-2a8ff94b1c0e',
 ban:'f410f672-79f7-44eb-8173-2a8ff94b1c0e',
};
const ADMIN_PASSWORD='Venue-Admin!Strong#17',JUDGE_PASSWORD='Venue-Judge!Strong#17';
const REAL_MODE=process.env.USD_VENUE_CI_STAFF_MODE==='existing';
const REAL_ADMIN='real-admin@usd.test',REAL_JUDGE='real-judge@usd.test';
const REAL_ADMIN_ID='b710f672-79f7-44eb-8173-2a8ff94b1c0e';
const REAL_JUDGE_ID='b810f672-79f7-44eb-8173-2a8ff94b1c0e';
const REAL_ROLE_ID='b910f672-79f7-44eb-8173-2a8ff94b1c0e';
function sealStaff(staff,stageId){
 const secret=randomBytes(32),nonce=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',secret,nonce);
 cipher.setAAD(Buffer.from('USD_VENUE_STAFF_V1:'+stageId));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(staff)),cipher.final()]);
 return {access:{format:1,algorithm:'AES-256-GCM',nonce:nonce.toString('base64url'),
  ciphertext:ciphertext.toString('base64url'),tag:cipher.getAuthTag().toString('base64url')},
  key:secret.toString('base64url')};
}

const api='http://api:3000';

function stableFixtureUuid(kind,index=0){
 const hex=createHash('sha256').update('usd-venue-e2e:'+kind+':'+index).digest('hex');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-8'+hex.slice(17,20)+'-'+hex.slice(20,32);
}
function syntheticSignedStage(staffAccess,mutate=()=>{},keys=generateKeyPairSync('ed25519')){
 const now=Date.now();
 const snapshot={
  format:1,purpose:'USD_VENUE_STAGE_READONLY',stageId:ID.stage,
  generatedAt:new Date(now-1000).toISOString(),
  expiresAt:new Date(now+4*60*60*1000).toISOString(),
  stage:{
   id:ID.stage,seasonId:ID.season,stageNumber:7,name:'USD LAN ACCEPTANCE',city:'Тюмень',
   date:'2026-11-12T00:00:00.000Z',venue:'CI',address:null,status:'PUBLISHED',
   registrationOpen:false,registrationStartsAt:null,registrationEndsAt:'2026-11-10T00:00:00.000Z',
   resultsPublishedAt:null,rulesSnapshot:{revision:'ci'},
   season:{id:ID.season,name:'USD CI',year:2026,status:'ACTIVE'},
   stageClasses:[{id:ID.stageClass,stageId:ID.stage,classId:ID.klass,sortOrder:0,
    isActive:true,participantLimit:null,customName:null,description:null,settings:null,
    class:{id:ID.klass,code:'L20_CI',name:'Limited 2.0',unit:'DB',sortOrder:0,isActive:true,
     direction:{id:ID.direction,name:'SPL',sortOrder:0,isActive:true}}}],
  },
  disqualifications:[{id:ID.ban,participantId:ID.banned,scope:'FORMAT',stageId:null,seasonId:null}],
  participantDirectory:[{id:ID.banned,firstName:'Недопущенный',lastName:'Тестовый',middleName:null,
   city:'Тюмень',team:null,isPublic:false,cars:[{id:ID.bannedCar,participantId:ID.banned,
    brand:'Lada',model:'Vesta',registrationCountry:'RU',registrationNumber:'А777ВС77',
    color:null,isPublic:false,isActive:true}]}],
  venuePolicy:{
   legal:{legalApproved:true,legalVersion:'1',ipName:'USD CI',
    privacyText:'Тестовая политика USD',consentText:'Тестовое согласие USD',
    termsText:'Тестовые условия USD',operatorAddress:'CI address',personalDataEmail:'data@example.org',
     documents:{officialProtocolConsent:{targetId:'legal-document-officialProtocolConsent-ci',url:'https://example.org/official-protocol.docx',fileName:'Consent.docx',blocks:[{type:'paragraph',text:'Тестовое согласие'}]}}},
   contactEmail:'venue@example.org',
   rulesPublished:{id:'ci-rules-1',blocks:[{type:'paragraph',text:'Тестовый регламент'}]},
  },
  ...(staffAccess?{staffAccess}:{}),
  registrations:[{
   id:ID.reg,stageId:ID.stage,participantId:ID.person,carId:ID.car,
   configurationVersionId:ID.config,configurationSnapshot:{configurationPending:true},
   participantNumber:6,source:'ON_SITE',status:'ACTIVE',
   registeredAt:new Date(now-5000).toISOString(),
   teamIdAtInspection:null,teamNameAtInspection:null,
   participant:{id:ID.person,firstName:'Тестовый',lastName:'Участник',middleName:null,
    city:'Тюмень',team:null,isPublic:false},
   car:{id:ID.car,participantId:ID.person,brand:'Secret',model:'Hidden',
    registrationCountry:'RU',registrationNumber:'А123ВС55',color:null,
    isPublic:false,isActive:true},
   numbers:[{id:ID.number,number:6,isPrimary:true}],
   classes:[{id:ID.regClass,classId:ID.klass,numberId:ID.number,
    class:{id:ID.klass,code:'L20_CI',name:'Limited 2.0',directionId:ID.direction},
    inspection:null}],
   inspection:{id:ID.inspection,status:'PASSED',checkedAt:new Date(now-3000).toISOString(),notes:null},
   stageInspection:null,results:[],
  }],
 };
 // Mirror production exports: every historical profile/car plus the complete
 // 19-class catalogue and more than one currently registered entrant. The
 // old one-entrant CI fixture missed Windows transaction saturation.
 snapshot.participantDirectory.push(...Array.from({length:750},(_,index)=>{
  const participantId=stableFixtureUuid('historical-person',index);
  return {id:participantId,firstName:'Из архива',lastName:'Профиль '+index,
   middleName:null,city:null,team:null,isPublic:false,
   cars:[{id:stableFixtureUuid('historical-car',index),participantId,brand:'Lada',model:'',
    registrationCountry:'RU',registrationNumber:'',color:null,isPublic:false,isActive:false}]};
 }));
 // Exercise five independent primary directions and extra BassRace classes.
 // The numbered BassRace classes have their own stickers when the primary
 // number is full; this uses the same 19-class stage package as Windows.
 const regularDirections=['SPL','BFSPL','Storm Wall','BDW SPL','Hurrican'];
 const bassNames=['BassRace 129.9','BassRace 139.9','BassRace 149.9'];
 for(let i=1;i<19;i++){
  const classId=stableFixtureUuid('extra-class',i);
  const directionName=i<5?regularDirections[i]:i>=16?'BassRace':'SPL';
  const directionId=i<5||i>=16
   ?stableFixtureUuid('stress-direction-'+directionName):ID.direction;
  const name=i<5?'CI '+directionName+' '+i:
   i>=16?bassNames[i-16]:'CI class '+i;
  snapshot.stage.stageClasses.push({
   id:stableFixtureUuid('extra-stage-class',i),stageId:ID.stage,classId,sortOrder:i,
   isActive:true,participantLimit:null,customName:null,description:null,settings:null,
   class:{id:classId,code:'CI_EXTRA_'+i,name,unit:'DB',
    sortOrder:i,isActive:true,direction:{id:directionId,name:directionName,sortOrder:0,isActive:true}},
  });
 }
 const second=structuredClone(snapshot.registrations[0]);
 second.id=stableFixtureUuid('second-registration');second.participantId=stableFixtureUuid('second-person');second.carId=stableFixtureUuid('second-car');
 second.configurationVersionId=stableFixtureUuid('second-version');second.participantNumber=7;
 second.participant.id=second.participantId;second.participant.firstName='Второй';
 second.car.id=second.carId;second.car.participantId=second.participantId;
 second.car.registrationNumber='А124ВС55';
 second.numbers[0].id=stableFixtureUuid('second-number');second.numbers[0].number=7;
 second.classes[0].id=stableFixtureUuid('second-registration-class');second.classes[0].numberId=second.numbers[0].id;
 second.inspection=null;second.stageInspection=null;
 snapshot.registrations.push(second);
 // A real PostgreSQL integration fixture: existing participants bring their
 // original version IDs and all equipment, including a non-registered car.
 const when=new Date(now-10000).toISOString();
 const makeConfig=(carId,versionId,name,withEquipment=false)=>{
  const configurationId=stableFixtureUuid('signed-config-'+carId);
  const amplifierId=stableFixtureUuid('signed-amplifier-'+carId);
  const speakerId=stableFixtureUuid('signed-speaker-'+carId);
  return {id:configurationId,carId,name,isActive:true,currentVersion:1,
   createdAt:when,updatedAt:when,
   versions:[{id:versionId,configurationId,version:1,
    vibrationIsolation:null,additionalDescription:null,createdAt:when,
    headUnits:[],batteries:[],generators:[],
    audioComponents:withEquipment?[{id:speakerId,versionId,brand:'Deaf Bonce',
     catalogEntryId:null,model:'Apocalypse',quantity:1,type:'SUBWOOFER',direction:'SUB'}]:[],
    amplifiers:withEquipment?[{id:amplifierId,versionId,brand:'Pride',
     catalogEntryId:null,model:'Bass',quantity:1,direction:'SUB',
     componentLinks:[{amplifierId,componentId:speakerId,quantity:1}]}]:[],
   }]};
 };
 snapshot.configurations=[
  makeConfig(ID.car,ID.config,'SPL Main',true),
  makeConfig(second.carId,second.configurationVersionId,'SPL Second'),
  makeConfig(ID.bannedCar,stableFixtureUuid('signed-directory-version'),'Directory-only system'),
 ];
 mutate(snapshot);
 const {privateKey,publicKey}=keys;
 const bytes=Buffer.from(JSON.stringify(snapshot));
 const digest=b=>createHash('sha256').update(b).digest('hex');
 const pub=publicKey.export({type:'spki',format:'der'});
 const integrity={
  algorithm:'Ed25519',sha256:digest(bytes),
  signature:sign(null,bytes,privateKey).toString('base64url'),
  publicKeyFingerprint:digest(pub),
 };
 return {container:{snapshot,integrity},
  publicPem:publicKey.export({type:'spki',format:'pem'}).toString(),keys};
}
async function seed(){
 assert.equal(process.env.USD_VENUE_LAN_MODE,'true');

 let realStaff=null;
 if(REAL_MODE){
  const users=[
   {id:REAL_ADMIN_ID,email:REAL_ADMIN,role:'ADMIN',name:'Старший судья',
    passwordHash:await bcrypt.hash(ADMIN_PASSWORD,12),isActive:true,
    emailVerifiedAt:'2026-11-10T10:00:00.000Z',customRole:null},
   {id:REAL_JUDGE_ID,email:REAL_JUDGE,role:'PARTICIPANT',name:'Судья 1',
    passwordHash:await bcrypt.hash(JUDGE_PASSWORD,12),isActive:true,
    emailVerifiedAt:'2026-11-10T10:00:00.000Z',
    customRole:{id:REAL_ROLE_ID,key:'judge',name:'Судья',
      permissions:{stages:['view'],registrations:['view','create','update'],
       inspections:['view','create','update'],results:['view','create','update','delete'],
       participants:['view','create'],cars:['view','create'],classes:['view'],
       configurations:['view','create','update'],siteSettings:['*']}}}
  ];
  realStaff=sealStaff(users,ID.stage);
 }
 const signed=syntheticSignedStage(realStaff?.access);
 process.env.VENUE_SIGNING_KEY_FINGERPRINT=signed.container.integrity.publicKeyFingerprint;
 const plan=planVenueStageImport(signed.container,signed.publicPem,process.env);
 const client=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{
  const privileges=await client.$queryRawUnsafe('SELECT rolsuper FROM pg_roles WHERE rolname=current_user');
  assert.equal(privileges[0].rolsuper,false,'API DB principal must never be superuser');
  // Exercise the EXACT Windows launcher child CLI, not just the imported
  // function that CI previously called. A tiny mock-only import hid failures.
  const temporary=await mkdtemp(join(tmpdir(),'usd-venue-ci-stage-'));
  try{
   const pkg=join(temporary,'stage.json'),pem=join(temporary,'public.pem');
   await writeFile(pkg,JSON.stringify(signed.container),{mode:0o600});
   await writeFile(pem,signed.publicPem,{mode:0o600});
   const stdout=execFileSync(process.execPath,[
    '/app/import-stage.mjs',pkg,pem,'--apply',ID.stage,
   ],{env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
   assert.match(stdout,/USD VENUE STAGE IMPORTED INTO ISOLATED LOCAL DB/);
  }finally{await rm(temporary,{recursive:true,force:true})}
  const imported=await applyVenueStageImport(plan,client);
  assert.equal(imported.replayed,true,'CLI committed the signed stage; module replay must be read-only');
  assert.equal(imported.registrations,2);
  assert.equal(imported.classes,19);
  const realVersion=await client.carConfigurationVersion.findUnique({
   where:{id:ID.config},include:{configuration:true,amplifiers:{include:{componentLinks:true}},audioComponents:true},
  });
  assert.equal(realVersion.configuration.name,'SPL Main');
  assert.equal(realVersion.configuration.carId,ID.car);
  assert.equal(realVersion.amplifiers[0]?.brand,'Pride');
  assert.equal(realVersion.audioComponents[0]?.brand,'Deaf Bonce');
  assert.equal(realVersion.amplifiers[0]?.componentLinks[0]?.componentId,realVersion.audioComponents[0]?.id);
  assert.equal(await client.carConfiguration.count(),3,'real versions and directory configs, no placeholders');
  assert.equal(await client.carConfiguration.count({where:{name:'USD VENUE: снимок регистрации'}}),0);
  assert.equal(await client.participant.count(),753,'all signed historical identities must import');
  const season=await client.season.findUnique({where:{id:ID.season}});
  assert.equal(season.status,'ACTIVE','The venue must permit on-site registration into active season');
  const settings=await client.siteSettings.findUnique({where:{id:'default'}});
  assert.equal(settings?.legal?.legalApproved,true,'The venue must carry the real approved legal policy');
  assert.equal(settings?.registration?.venueDisqualificationSnapshot?.stageId,ID.stage);
  assert.equal(settings?.registration?.venueDisqualificationSnapshot?.records?.[0]?.participantId,ID.banned);
  assert.equal(settings?.registration?.rulesDocument?.published?.id,'ci-rules-1');
  assert.equal((await applyVenueStageImport(plan,client)).replayed,true);
  if(REAL_MODE){
   assert.throws(()=>decryptExistingVenueStaff(realStaff.access,randomBytes(32).toString('base64url'),ID.stage),
    /шифр доступа сотрудников/);
   const roster=decryptExistingVenueStaff(signed.container.snapshot.staffAccess,realStaff.key,ID.stage);
   assert.deepEqual(roster.map(u=>u.email),[REAL_ADMIN,REAL_JUDGE]);
   const admitted=await applyExistingVenueStaff(roster,ID.stage,client);
   assert.equal(admitted.staffCount,2);
   assert.equal(admitted.replayed,false);
   const replay=await applyExistingVenueStaff(roster,ID.stage,client);
   assert.equal(replay.replayed,true,'User import must be idempotent after crash');
   const judge=await client.user.findUnique({where:{id:REAL_JUDGE_ID},include:{customRole:true}});
   assert.equal(judge.email,REAL_JUDGE);
   assert.equal(judge.customRole.key,'venue-stage-'+REAL_ROLE_ID);
   assert.deepEqual(judge.customRole.permissions.results,['view','create']);
   assert.ok(!judge.customRole.permissions.siteSettings);
   assert.equal(await bcrypt.compare(JUDGE_PASSWORD,judge.passwordHash),true);
   const admin=await client.user.findUnique({where:{id:REAL_ADMIN_ID}});
   assert.equal(admin.email,REAL_ADMIN);
   assert.equal(await bcrypt.compare(ADMIN_PASSWORD,admin.passwordHash),true);
   assert.equal(await client.user.count(),2);
   assert.equal(await client.auditLog.count({where:{action:'VENUE_EXISTING_STAFF_ENABLED'}}),1);
  }else{
   const admin=await provisionVenueStaff(planVenueStaff('admin','operator1',process.env),
    ADMIN_PASSWORD,client,password=>bcrypt.hash(password,12));
   const judge=await provisionVenueStaff(planVenueStaff('judge','judge-01',process.env),
    JUDGE_PASSWORD,client,password=>bcrypt.hash(password,12));
   assert.equal(admin.role,'ADMIN');assert.equal(judge.role,'JUDGE');
   const users=await client.user.findMany({
    where:{email:{endsWith:'@venue.invalid'}},select:{email:true,role:true,customRoleId:true},
   });
   assert.equal(users.length,2);
   assert.equal(users.find(u=>u.email.startsWith('judge-'))?.role,'PARTICIPANT');
   const audit=await client.auditLog.findMany({where:{action:'VENUE_STAFF_CREATED'}});
   assert.equal(audit.length,2);
   assert.ok(audit.every(entry=>!JSON.stringify(entry.metadata).includes('!Strong#17')));
  }
 }finally{await client.$disconnect()}
 console.log('USD CI VENUE DB SEED PASS: signed one-stage import, replay denied, isolated staff + RBAC');
}
async function request(path,init={}){
 const response=await fetch(api+path,{
  ...init,headers:{...(init.headers??{}),'Content-Type':'application/json'},
  signal:AbortSignal.timeout(15000),
 });
 return {status:response.status,body:await response.json().catch(()=>({}))};
}
async function login(email,password){
 const result=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
 assert.equal(result.status,201,'Login failed '+email+': '+JSON.stringify(result.body));
 assert.ok(result.body.accessToken);
 return result.body;
}
async function probe(){
 let available=false;
 for(let i=0;i<40;i++){
  try{
   const response=await request('/results/venue-live');
   if(response.status===200){available=true;break}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert.ok(available,'Nest API must boot with isolated venue DB');
 const early=await request('/results/venue-live');
 assert.equal(early.body.stage.id,ID.stage);
 assert.deepEqual(early.body.rows,[]);
 const unpublished=await request('/results/stage/'+ID.stage);
 assert.equal(unpublished.status,404,'LAN measurements must NOT be public site archive results');

 const admin=await login(REAL_MODE?REAL_ADMIN:'operator1@venue.invalid',ADMIN_PASSWORD);
 const judge=await login(REAL_MODE?REAL_JUDGE:'judge-01@venue.invalid',JUDGE_PASSWORD);
 assert.equal(admin.user.role,'ADMIN');
 assert.equal(judge.user.role,'PARTICIPANT');
 assert.equal(judge.user.customRole?.key,REAL_MODE?'venue-stage-'+REAL_ROLE_ID:'venue-judge');
 if(REAL_MODE){
  assert.equal(judge.user.id,REAL_JUDGE_ID);
  assert.equal(admin.user.id,REAL_ADMIN_ID);
 }
 const authJudge={Authorization:'Bearer '+judge.accessToken};
 const authAdmin={Authorization:'Bearer '+admin.accessToken};
 assert.equal((await request('/auth/admin/users',{headers:authJudge})).status,403,
  'Judge must not view/manage local user administration');
 assert.equal((await request('/auth/admin/users',{headers:authAdmin})).status,403,
  'Offline ADMIN must not manage global user administration');
 assert.equal((await request('/stages',{method:'POST',headers:authAdmin,
  body:JSON.stringify({name:'Wrong stage'})})).status,403,
  'Offline ADMIN must not create stages');
 const roster=await request('/registrations?stageId='+ID.stage,{headers:authJudge});
 assert.equal(roster.status,200);
 const publicSettings=await request('/site-settings/public');
 assert.equal(publicSettings.status,200);
 assert.ok(!JSON.stringify(publicSettings.body).includes(ID.banned),
  'Public settings must never leak signed disciplinary identity IDs');
 const denied=await request('/registrations',{method:'POST',headers:authAdmin,
  body:JSON.stringify({stageId:ID.stage,participantId:ID.banned,carId:ID.bannedCar,
   classIds:[ID.klass],source:'ON_SITE',rulesAccepted:true,privacyConsent:true,
   termsAccepted:true,protocolConsent:true})});
 assert.equal(denied.status,409,'Signed central FORMAT ban must reject LAN registration');
 assert.match(JSON.stringify(denied.body),/PARTICIPANT_FORMAT_DISQUALIFIED/);
 const newProfile=await request('/registrations/on-site/profile',{method:'POST',headers:authAdmin,
  body:JSON.stringify({
   lastName:'Площадочный',firstName:'Новый',brand:'Lada',model:'Granta',
   registrationCountry:'RU',registrationNumber:'А555ВС77',
   privacyConsent:true,termsAccepted:true,
  })});
 assert.equal(newProfile.status,201,'Real on-site profile creation must work: '+JSON.stringify(newProfile.body));
 assert.ok(newProfile.body.participantId&&newProfile.body.carId);
 // Closing public signups 1-2 days before the event must not block the gate.
 const onlineClosed=await request('/registrations',{method:'POST',headers:authAdmin,
  body:JSON.stringify({
   stageId:ID.stage,participantId:newProfile.body.participantId,carId:newProfile.body.carId,
   configurationVersionId:ID.config,classIds:[ID.klass],source:'PRE_REGISTRATION',
   rulesAccepted:true,privacyConsent:true,termsAccepted:true,protocolConsent:true,
  })});
 assert.equal(onlineClosed.status,400,'Online preregistration must remain closed for staff too');
 assert.match(JSON.stringify(onlineClosed.body),/Регистрация на этот этап закрыта/);
 const onsite=await request('/registrations',{method:'POST',headers:authAdmin,
  body:JSON.stringify({
   stageId:ID.stage,participantId:newProfile.body.participantId,carId:newProfile.body.carId,
   classIds:[ID.klass],source:'ON_SITE',rulesAccepted:true,privacyConsent:true,termsAccepted:true,protocolConsent:true,
  })});
 assert.equal(onsite.status,201,'Real on-site registration must work: '+JSON.stringify(onsite.body));
 assert.ok(onsite.body.id);
 const newInspection=await request('/inspections',{method:'POST',headers:authAdmin,
  body:JSON.stringify({registrationId:onsite.body.id,status:'PASSED'})});
 assert.equal(newInspection.status,201,'New competitor should pass shared inspection: '+JSON.stringify(newInspection.body));
 const create=await request('/results',{method:'POST',headers:authJudge,
  body:JSON.stringify({
   registrationId:ID.reg,registrationClassId:ID.regClass,value:152.345,confirmed:true,
  })});
 assert.equal(create.status,201,'Judge result creation failed: '+JSON.stringify(create.body));
 const measured=await request('/results/venue-live');
 assert.equal(measured.status,200);
 assert.equal(measured.body.rows.length,1);
 assert.equal(Number(measured.body.rows[0].value),152.345);
 assert.equal(measured.body.rows[0].number,6);
 assert.equal(measured.body.rows[0].participant,'Участник Тестовый');
 assert.equal(measured.body.rows[0].car,'Автомобиль скрыт');
 assert.ok(!JSON.stringify(measured.body).includes('А123ВС55'));
 const resultId=measured.body.rows[0].id;
 const forbidden=await request('/results/'+resultId,{method:'PATCH',headers:authJudge,
  body:JSON.stringify({value:155.5})});
 assert.equal(forbidden.status,403,'Judge must not correct measurements');
 const corrected=await request('/results/'+resultId,{method:'PATCH',headers:authAdmin,
  body:JSON.stringify({value:155.5})});
 assert.equal(corrected.status,200,'ADMIN correction failed: '+JSON.stringify(corrected.body));
 const after=await request('/results/venue-live');
 assert.equal(Number(after.body.rows[0].value),155.5,'Second phone sees updated local LAN score');
 assert.equal((await request('/results/stage/'+ID.stage)).status,404);
 // Journal is owned by the bootstrap PostgreSQL role. Even the LAN API
 // account (and so a compromised judge session) cannot delete its history.
 const verifyClient=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{
  const chain=await verifyClient.$queryRawUnsafe(
   "SELECT sequence,table_name,operation,previous_hash,hash,payload,"+
   "encode(digest(previous_hash || payload::text,'sha256'),'hex') AS calculated "+
   "FROM venue_private.operation_journal ORDER BY sequence",
  );
  assert.ok(chain.length>=6,'New entrant, inspection, score and ADMIN correction must be journaled');
  assert.ok(chain.some(x=>x.table_name==='Result'&&x.operation==='INSERT'));
  assert.ok(chain.some(x=>x.table_name==='Result'&&x.operation==='UPDATE'));
  let previous='0'.repeat(64);
  for(const event of chain){
   assert.equal(event.previous_hash,previous);
   assert.equal(event.hash,event.calculated);
   assert.equal(event.payload.stageId,ID.stage);
   previous=event.hash;
  }
  const returnSnapshot=await collectVenueJournal(verifyClient,process.env,Date.now());
  assert.equal(returnSnapshot.eventCount,chain.length);
  const {privateKey:venueSigning,publicKey:venueTrust}=generateKeyPairSync('ed25519');
  const privatePem=venueSigning.export({type:'pkcs8',format:'pem'}).toString();
  const publicPem=venueTrust.export({type:'spki',format:'pem'}).toString();
  const fingerprint=createHash('sha256').update(venueTrust.export({type:'spki',format:'der'})).digest('hex');
  const encrypted=encryptVenueReturn(signVenueReturnSnapshot(returnSnapshot,privatePem),'Venue-USB!Strong#2026');
  assert.ok(!JSON.stringify(encrypted).includes('Тестовый'));
  assert.ok(!JSON.stringify(encrypted).includes('А123ВС55'));
  const opened=openVenueReturn(encrypted,'Venue-USB!Strong#2026',publicPem,{
   stageId:ID.stage,baselineSha256:returnSnapshot.baselineSha256,
   trustedFingerprint:fingerprint,now:Date.now(),
  });
  assert.equal(opened.eventCount,chain.length);
  assert.equal(opened.journalEndHash,returnSnapshot.journalEndHash);
  await assert.rejects(()=>verifyClient.$executeRawUnsafe(
   'DELETE FROM venue_private.operation_journal'),/permission|P2010|denied/i);
 }finally{await verifyClient.$disconnect()}
 console.log('USD CI LAN REAL DB + API PASS: judge login/write, spectator LIVE, admin correction, private data redacted, unpublished archive denied');
}
async function retainedSeason(){
 const normal=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 const rootUrl=new URL(process.env.DATABASE_URL);
 rootUrl.username='usd_venue_root';rootUrl.password=process.env.VENUE_DB_ROOT_PASSWORD;
 const root=new PrismaClient({adapter:new PrismaPg({connectionString:rootUrl.toString()})});
 const second='c520f672-79f7-44eb-8173-2a8ff94b1c0e';
 const mappedIds=new Map();
 const newId=id=>{if(!mappedIds.has(id))mappedIds.set(id,randomUUID());return mappedIds.get(id)};
 try{
  const legacyVersionId=stableFixtureUuid('second-version');
  const legacyCarId=stableFixtureUuid('second-car');
  const legacyParentId=stableFixtureUuid('legacy-placeholder');
  const signedParentId=stableFixtureUuid('signed-config-'+legacyCarId);
  const restoredHeadUnitId=stableFixtureUuid('restored-head-unit');
  // Recreate the row layout produced by a pre-equipment signed stage while
  // keeping its original version UUID and registration reference.
  await root.$transaction(async tx=>{
   await tx.$queryRawUnsafe("SELECT set_config('usd_venue.importing','true',true)");
   await tx.carConfiguration.create({data:{
    id:legacyParentId,carId:legacyCarId,name:'USD VENUE: снимок регистрации',isActive:false,
   }});
   await tx.carConfigurationVersion.update({where:{id:legacyVersionId},data:{
    configurationId:legacyParentId,additionalDescription:'Только локальный FK. Источник оборудования: Registration.configurationSnapshot.',
   }});
  });
  const oldResults=await normal.result.findMany({orderBy:{id:'asc'}});
  const oldRegistrations=await normal.registration.findMany({where:{stageId:ID.stage},orderBy:{id:'asc'}});
  assert.ok(oldRegistrations.some(r=>r.configurationVersionId===legacyVersionId));
  const before=await collectVenueJournal(normal,process.env);
  const people=await normal.participant.count();
  const versions=await normal.carConfigurationVersion.count();
  const signed=syntheticSignedStage(undefined,s=>{
   s.stageId=second;s.stage.id=second;s.stage.stageNumber=8;
   delete s.venuePolicy;
   const restored=s.configurations.find(c=>c.id===signedParentId).versions[0];
   restored.headUnits.push({id:restoredHeadUnitId,versionId:legacyVersionId,brand:'USD',
    catalogEntryId:null,model:'Legacy upgrade fixture',direction:'SUB'});
   s.stage.stageClasses.forEach(c=>{c.id=newId(c.id);c.stageId=second});
   for(const r of s.registrations){
    r.id=newId(r.id);r.stageId=second;
    r.numbers.forEach(n=>{n.id=newId(n.id)});
    r.classes.forEach(c=>{c.id=newId(c.id);c.numberId=newId(c.numberId)});
    if(r.inspection)r.inspection.id=newId(r.inspection.id);
   }
  });
  const env={...process.env,VENUE_STAGE_ID:second,
   VENUE_SIGNING_KEY_FINGERPRINT:signed.container.integrity.publicKeyFingerprint};
  const plan=planVenueStageImport(signed.container,signed.publicPem,env);
  await applyVenueStageImport(plan,root,{shared:true});
  assert.equal(await normal.stage.count(),2);
  const intake=await normal.siteSettings.findUnique({where:{id:'default'}});
  assert.equal(intake.legal.legalApproved,false);
  assert.equal(intake.registration.enabled,false);
  const recovered=await planInstalledVenueStageImport(signed.container,signed.publicPem,env,normal,Date.now()+4*86400000);
  assert.equal(recovered.packageHash,plan.packageHash);
  assert.equal(await normal.participant.count(),people);
  assert.equal(await normal.carConfigurationVersion.count(),versions);
  assert.deepEqual(await normal.result.findMany({orderBy:{id:'asc'}}),oldResults);
  assert.deepEqual(await normal.registration.findMany({where:{stageId:ID.stage},orderBy:{id:'asc'}}),oldRegistrations);
  const restoredVersion=await normal.carConfigurationVersion.findUnique({
   where:{id:legacyVersionId},include:{headUnits:true},
  });
  assert.equal(restoredVersion.configurationId,signedParentId);
  assert.deepEqual(restoredVersion.headUnits.map(row=>row.id),[restoredHeadUnitId]);
  assert.ok(await normal.registration.findFirst({where:{stageId:second,configurationVersionId:legacyVersionId}}));
  const secondBefore=await collectVenueJournal(normal,env);
  assert.equal(secondBefore.eventCount,0,'Imported baseline must not become local mutations');
  const active=await root.$queryRawUnsafe('SELECT stage_id AS id FROM venue_private.active_stage');
  assert.equal(active[0].id,second);
  // Reproduce the actual Windows directory updater against an already
  // installed stage with retained history, new profiles, and a late signup.
  const refreshedSnapshot=structuredClone(signed.container.snapshot);
  const added=Array.from({length:300},(_,index)=>{
   const id=stableFixtureUuid('directory-refresh-person',index);
   return {id,firstName:'Новый',lastName:'Профиль '+index,middleName:null,city:null,team:null,isPublic:false,
    cars:[{id:stableFixtureUuid('directory-refresh-car',index),participantId:id,brand:'Lada',model:'Vesta',
     registrationCountry:'RU',registrationNumber:'',color:null,isPublic:false,isActive:true}]};
  });
  refreshedSnapshot.participantDirectory.push(...added);
  const late=structuredClone(refreshedSnapshot.registrations[1]);
  const latePerson=added[0],lateCar=latePerson.cars[0];
  lateCar.registrationNumber='А555ВС55';
  const {cars:unusedCars,...lateIdentity}=latePerson;
  Object.assign(late,{id:stableFixtureUuid('directory-refresh-registration'),participantId:latePerson.id,
   carId:lateCar.id,participant:lateIdentity,car:lateCar,participantNumber:99,
   configurationVersionId:stableFixtureUuid('directory-refresh-version'),inspection:null,stageInspection:null,results:[]});
  late.numbers=[{id:stableFixtureUuid('directory-refresh-number'),number:99,isPrimary:true}];
  late.classes=[{...late.classes[0],id:stableFixtureUuid('directory-refresh-class'),numberId:late.numbers[0].id,inspection:null}];
  refreshedSnapshot.registrations.push(late);
  const sourceConfig=structuredClone(refreshedSnapshot.configurations.find(c=>c.carId===refreshedSnapshot.registrations[1].carId));
  Object.assign(sourceConfig,{id:stableFixtureUuid('directory-refresh-config'),carId:lateCar.id});
  sourceConfig.versions=[{...sourceConfig.versions[0],id:late.configurationVersionId,configurationId:sourceConfig.id}];
  refreshedSnapshot.configurations.push(sourceConfig);
  // Keep the same stage signer and use the CLI's root-only import connection.
  const fresh=syntheticSignedStage(undefined,s=>Object.assign(s,refreshedSnapshot),signed.keys);
  const dir=await mkdtemp(join(tmpdir(),'usd-directory-refresh-'));
  try{
   const pkg=join(dir,'stage.json'),pem=join(dir,'public.pem');
   await writeFile(pkg,JSON.stringify(fresh.container),{mode:0o600});
   await writeFile(pem,fresh.publicPem,{mode:0o600});
   const rootEnv={...env,DATABASE_URL:rootUrl.toString(),VENUE_DB_USER:'usd_venue_root',
    VENUE_DB_PASSWORD:process.env.VENUE_DB_ROOT_PASSWORD};
   const run=mode=>execFileSync(process.execPath,['/app/import-stage.mjs',pkg,pem,mode],
    {env:rootEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']});
   const regCount=await normal.registration.count();
   assert.match(run('--apply-directory'),/"addedParticipants":300/);
   assert.equal(await normal.participant.count(),people+300);
   assert.equal(await normal.registration.count(),regCount);
   assert.match(run('--apply-directory'),/"replayed":true/);
   assert.match(run('--prepare-roster'),/"refreshedRegistrations":1/);
   assert.equal(await normal.registration.count(),regCount+1);
   assert.equal((await normal.registration.findUnique({where:{id:late.id}})).participantNumber,99);
   assert.deepEqual(await normal.result.findMany({orderBy:{id:'asc'}}),oldResults);
   assert.deepEqual(await normal.registration.findMany({where:{stageId:ID.stage},orderBy:{id:'asc'}}),oldRegistrations);
   assert.equal((await collectVenueJournal(normal,env)).eventCount,0);
   assert.match(run('--prepare-roster'),/"refreshedRegistrations":0/);
  }finally{await rm(dir,{recursive:true,force:true})}
  const reg=plan.registrations[0];
  await normal.result.create({data:{registrationId:reg.id,registrationClassId:reg.classes[0].id,value:'148.200',unit:'DB',verificationStatus:'NOT_REQUIRED'}});
  const after=await collectVenueJournal(normal,env);
  assert.equal(after.eventCount,1);
  assert.equal(after.events[0].previousHash,'0'.repeat(64));
  assert.ok(after.events.every(e=>e.payload.stageId===second));
  const oldAfter=await collectVenueJournal(normal,process.env);
  assert.equal(oldAfter.journalEndHash,before.journalEndHash);
  assert.deepEqual(oldAfter.events,before.events);
  assert.equal((await applyVenueStageImport(plan,root,{shared:true})).replayed,true);
  assert.equal(await normal.result.count(),oldResults.length+1);
  if(oldResults[0])await assert.rejects(()=>normal.result.update({where:{id:oldResults[0].id},data:{value:'1'}}),/historical|P2004|P2010|database/i);
  const replacement={...plan,packageHash:'0'.repeat(64)};
  await assert.rejects(()=>applyVenueStageImport(replacement,root,{shared:true}),/другого пакета/);
  console.log('USD RETAINED SEASON PASS: one database, two stages, reused identities/configurations, independent exports, migrated legacy equipment, crash replay, historical registrations and results unchanged');
 }finally{await normal.$disconnect();await root.$disconnect()}
}
const mode=process.argv[2];
if(mode==='seed')await seed();
else if(mode==='probe')await probe();
else if(mode==='season')await retainedSeason();
else throw Error('Usage: node venue-db-acceptance.mjs seed|probe');
