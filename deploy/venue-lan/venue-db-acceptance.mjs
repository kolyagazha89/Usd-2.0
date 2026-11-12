#!/usr/bin/env node
/** Real, disposable PostgreSQL 18 + Nest API acceptance.
 * Run ONLY against CI-created isolated usd-venue Compose, never production.
 * Covers signed import, independent ADMIN/JUDGE, judge writes and LAN live.
 */
import {strict as assert} from 'node:assert';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {createRequire} from 'node:module';
import {planVenueStageImport,applyVenueStageImport} from './import-stage.mjs';
import {planVenueStaff,provisionVenueStaff} from './provision-staff.mjs';

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
};
const ADMIN_PASSWORD='Venue-Admin!Strong#17',JUDGE_PASSWORD='Venue-Judge!Strong#17';
const api='http://api:3000';

function syntheticSignedStage(){
 const now=Date.now();
 const snapshot={
  format:1,purpose:'USD_VENUE_STAGE_READONLY',stageId:ID.stage,
  generatedAt:new Date(now-1000).toISOString(),
  expiresAt:new Date(now+4*60*60*1000).toISOString(),
  stage:{
   id:ID.stage,seasonId:ID.season,stageNumber:7,name:'USD LAN ACCEPTANCE',city:'Тюмень',
   date:'2026-11-12T00:00:00.000Z',venue:'CI',address:null,status:'PUBLISHED',
   registrationOpen:true,registrationStartsAt:null,registrationEndsAt:null,
   resultsPublishedAt:null,rulesSnapshot:{revision:'ci'},
   season:{id:ID.season,name:'USD CI',year:2026},
   stageClasses:[{id:ID.stageClass,stageId:ID.stage,classId:ID.klass,sortOrder:0,
    isActive:true,participantLimit:null,customName:null,description:null,settings:null,
    class:{id:ID.klass,code:'L20_CI',name:'Limited 2.0',unit:'DB',sortOrder:0,isActive:true,
     direction:{id:ID.direction,name:'SPL',sortOrder:0,isActive:true}}}],
  },
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
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const bytes=Buffer.from(JSON.stringify(snapshot));
 const digest=b=>createHash('sha256').update(b).digest('hex');
 const pub=publicKey.export({type:'spki',format:'der'});
 const integrity={
  algorithm:'Ed25519',sha256:digest(bytes),
  signature:sign(null,bytes,privateKey).toString('base64url'),
  publicKeyFingerprint:digest(pub),
 };
 return {container:{snapshot,integrity},
  publicPem:publicKey.export({type:'spki',format:'pem'}).toString()};
}
async function seed(){
 assert.equal(process.env.USD_VENUE_LAN_MODE,'true');
 const signed=syntheticSignedStage();
 process.env.VENUE_SIGNING_KEY_FINGERPRINT=signed.container.integrity.publicKeyFingerprint;
 const plan=planVenueStageImport(signed.container,signed.publicPem,process.env);
 const client=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{
  const privileges=await client.$queryRawUnsafe('SELECT rolsuper FROM pg_roles WHERE rolname=current_user');
  assert.equal(privileges[0].rolsuper,false,'API DB principal must never be superuser');
  const imported=await applyVenueStageImport(plan,client);
  assert.equal(imported.registrations,1);
  await assert.rejects(()=>applyVenueStageImport(plan,client),/не пуста/);
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

 const admin=await login('operator1@venue.invalid',ADMIN_PASSWORD);
 const judge=await login('judge-01@venue.invalid',JUDGE_PASSWORD);
 assert.equal(admin.user.role,'ADMIN');
 assert.equal(judge.user.role,'PARTICIPANT');
 assert.equal(judge.user.customRole?.key,'venue-judge');
 const authJudge={Authorization:'Bearer '+judge.accessToken};
 const authAdmin={Authorization:'Bearer '+admin.accessToken};
 assert.equal((await request('/auth/admin/users',{headers:authJudge})).status,403,
  'Judge must not view/manage local user administration');
 const roster=await request('/registrations?stageId='+ID.stage,{headers:authJudge});
 assert.equal(roster.status,200);
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
 assert.equal(measured.body.rows[0].participant,'Участник скрыт');
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
 console.log('USD CI LAN REAL DB + API PASS: judge login/write, spectator LIVE, admin correction, private data redacted, unpublished archive denied');
}
const mode=process.argv[2];
if(mode==='seed')await seed();
else if(mode==='probe')await probe();
else throw Error('Usage: node venue-db-acceptance.mjs seed|probe');
