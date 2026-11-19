import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,randomBytes,createHash} from 'node:crypto';
import {decryptExistingVenueStaff,applyExistingVenueStaff,preflightExistingVenueStaff} from './provision-existing-staff.mjs';

const stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
const hash='$2b$12$'+'A'.repeat(53);
const users=[
 {id:'a510f672-79f7-44eb-8173-2a8ff94b1c0e',email:'owner@usd.test',name:'Owner',
  role:'ADMIN',passwordHash:hash,isActive:true,emailVerifiedAt:'2026-11-01T00:00:00Z',customRole:null},
 {id:'b510f672-79f7-44eb-8173-2a8ff94b1c0e',email:'judge@usd.test',name:'Judge',
  role:'PARTICIPANT',passwordHash:hash,isActive:true,emailVerifiedAt:'2026-11-01T00:00:00Z',
  customRole:{id:'d510f672-79f7-44eb-8173-2a8ff94b1c0e',key:'judge',name:'Судья',
   permissions:{registrations:['view','create'],inspections:['view','create','update'],
    results:['view','create','update','delete'],siteSettings:['*']}}},
];
const wrap=(data=users,target=stage)=>{
 const secret=randomBytes(32),iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',secret,iv);
 cipher.setAAD(Buffer.from('USD_VENUE_STAFF_V1:'+target));
 const payload=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]);
 return {key:secret.toString('base64url'),sealed:{format:1,algorithm:'AES-256-GCM',
  nonce:iv.toString('base64url'),ciphertext:payload.toString('base64url'),tag:cipher.getAuthTag().toString('base64url')}};
};
test('signed stage staff envelope preserves existing emails and UUIDs, strips extra venue permissions',()=>{
 const {key,sealed}=wrap();
 const result=decryptExistingVenueStaff(sealed,key,stage);
 assert.deepEqual(result.map(x=>x.email),users.map(x=>x.email));
 assert.equal(result[0].id,users[0].id);
 assert.equal(result[1].id,users[1].id);
 assert.deepEqual(result[1].customRole.permissions.results,['view','create']);
 assert.equal(result[1].customRole.permissions.siteSettings,undefined);
});
test('refuses wrong key, bad tag, stage mismatch, malformed staff, revoked or duplicate identities',()=>{
 const {key,sealed}=wrap();
 assert.throws(()=>decryptExistingVenueStaff(sealed,randomBytes(32).toString('base64url'),stage),/шифр|ключ|доступ/i);
 assert.throws(()=>decryptExistingVenueStaff(sealed,key,'d510f672-79f7-44eb-8173-2a8ff94b1c0e'),/шифр|ключ|доступ/i);
 assert.throws(()=>decryptExistingVenueStaff({...sealed,tag:randomBytes(16).toString('base64url')},key,stage),/шифр|ключ|доступ/i);
 for(const data of [[users[1]], [...users,users[1]], [{...users[0],emailVerifiedAt:null},users[1]],
  [{...users[0],passwordHash:'oops'},users[1]], [{...users[0],role:'PARTICIPANT'},users[1]],
  [users[0],{...users[1],customRole:null}]]){
  const d=wrap(data);
  assert.throws(()=>decryptExistingVenueStaff(d.sealed,d.key,stage),/сотруд|пользоват|администрат|парол|роль|доступ/i);
 }
});
function fakeDb(){
 const log=[];const rows=new Map(),roles=new Map();let stageCount=1;
 const tx={
  $executeRawUnsafe:async()=>1,
  $queryRawUnsafe:async()=>[{rolsuper:false}],
  stage:{count:async()=>stageCount,findFirst:async()=>({id:stage})},
  user:{count:async()=>rows.size,findMany:async()=>[...rows.values()],
   create:async({data})=>{if(rows.has(data.id))throw Error('duplicate user');rows.set(data.id,data);log.push({type:'user',data});return {id:data.id}}},
  role:{findUnique:async({where})=>[...roles.values()].find(r=>r.key===where.key||r.id===where.id)??null,
   create:async({data})=>{roles.set(data.id,data);log.push({type:'role',data});return data}},
  auditLog:{create:async({data})=>{log.push({type:'audit',data});return data}},
 };
 const prisma={$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'Serializable');return fn(tx)}};
 return {prisma,log,rows,roles};
}
test('imports same judge identities and password hash atomically; reapplying is safe',async()=>{
 const {key,sealed}=wrap();const parsed=decryptExistingVenueStaff(sealed,key,stage);
 const {prisma,log,rows}=fakeDb();
 const first=await applyExistingVenueStaff(parsed,stage,prisma);
 assert.equal(first.staffCount,2);
 assert.equal(rows.get(users[0].id).email,users[0].email);
 assert.equal(rows.get(users[1].id).passwordHash,hash);
 assert.equal(rows.get(users[1].id).role,'PARTICIPANT');
 assert.ok(rows.get(users[1].id).customRoleId);
 assert.equal(log.filter(x=>x.type==='role').length,1);
 assert.equal(log.filter(x=>x.type==='audit').length,1);
 const second=await applyExistingVenueStaff(parsed,stage,prisma);
 assert.equal(second.staffCount,2);
 assert.equal(log.filter(x=>x.type==='user').length,2);
 assert.equal(log.filter(x=>x.type==='audit').length,1);
});
test('does not overwrite a different local account, stage or database',async()=>{
 const {key,sealed}=wrap();const parsed=decryptExistingVenueStaff(sealed,key,stage);
 const db=fakeDb();
 db.rows.set('untrusted',{id:'untrusted',email:'intruder@test.invalid'});
 await assert.rejects(()=>applyExistingVenueStaff(parsed,stage,db.prisma),/посторон|конфликт|чуж|сотруд/i);
});

test('real staff enrollment coexists with migration-seeded judge role without modifying its global permissions',async()=>{
 const {key,sealed}=wrap();
 const staff=decryptExistingVenueStaff(sealed,key,stage);
 const db=fakeDb();
 const seededRole={id:'c710f672-79f7-44eb-8173-2a8ff94b1c0e',
   key:'judge',name:'Судья USD',permissions:{results:['*'],siteSettings:['*']},isSystem:true};
 db.roles.set(seededRole.id,structuredClone(seededRole));
 const installed=await applyExistingVenueStaff(staff,stage,db.prisma);
 assert.equal(installed.staffCount,2);
 assert.deepEqual(db.roles.get(seededRole.id),seededRole,'global seed role must stay untouched');
 const judge=db.rows.get(users[1].id);
 assert.equal(judge.customRoleId,users[1].customRole.id);
 assert.equal(db.roles.get(users[1].customRole.id).key,'venue-stage-'+users[1].customRole.id);
 assert.deepEqual(db.roles.get(users[1].customRole.id).permissions.results,['view','create']);
});

test('crash retry refuses a broadened local judge role instead of silently authorizing it',async()=>{
 const {key,sealed}=wrap();
 const staff=decryptExistingVenueStaff(sealed,key,stage);
 const db=fakeDb();
 await applyExistingVenueStaff(staff,stage,db.prisma);
 const role=db.roles.get(users[1].customRole.id);
 role.permissions={...role.permissions,results:['*'],siteSettings:['*']};
 await assert.rejects(()=>applyExistingVenueStaff(staff,stage,db.prisma),
   /прав|роль|подмен|конфликт/i);
});

test('next-stage roster may refresh staff while old competition records remain',async()=>{
 const {key,sealed}=wrap();const parsed=decryptExistingVenueStaff(sealed,key,stage);
 const {prisma,rows}=fakeDb();
 await applyExistingVenueStaff(parsed,stage,prisma);
 const changed=parsed.map(u=>({...u,passwordHash:'$2b$12$'+'B'.repeat(53)}));
 // Extend the local fixture with actual database update operations.
 const original=prisma.$transaction;
 prisma.$transaction=(fn,opts)=>original(async tx=>{
  tx.stage.count=async()=>2;
  tx.user.updateMany=async({where,data})=>{for(const u of rows.values())if(!where||!where.id.notIn.includes(u.id))Object.assign(u,data)};
  tx.user.upsert=async({where,create,update})=>{const old=rows.get(where.id);rows.set(where.id,old?{...old,...update}:create)};
  tx.role.upsert=async()=>({});
  tx.refreshSession={deleteMany:async()=>({count:0})};
  return fn(tx);
 },opts);
 await applyExistingVenueStaff(changed,stage,prisma,{shared:true});
 assert.equal(rows.get(users[0].id).passwordHash,changed[0].passwordHash);
});

test('fresh stage staff preflight decrypts and validates the correct key WITHOUT connecting to PostgreSQL',()=>{
 const {key,sealed}=wrap();
 const signed={snapshot:{stageId:stage,staffAccess:sealed}};
 const fakePlan=()=>({summary:{stageId:stage}});
 const ready=preflightExistingVenueStaff(signed,key,stage,fakePlan);
 assert.equal(ready.staffCount,2);
 assert.equal(ready.stageId,stage);
 assert.throws(()=>preflightExistingVenueStaff(signed,randomBytes(32).toString('base64url'),stage,fakePlan),/шифр|ключ|доступ/i);
 assert.throws(()=>preflightExistingVenueStaff(signed,key,
  'e510f672-79f7-44eb-8173-2a8ff94b1c0e',fakePlan),/пакет|этап/i);
});
