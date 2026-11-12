import test from 'node:test';
import assert from 'node:assert/strict';
import {planVenueStaff,provisionVenueStaff,VENUE_JUDGE_PERMISSIONS} from './provision-staff.mjs';

const STAGE='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
const env={
 USD_VENUE_LAN_MODE:'true',VENUE_STAGE_ID:STAGE,
 DATABASE_URL:'postgresql://usd_venue:local-test-password@db:5432/usd_venue?schema=public',
 VENUE_DB_NAME:'usd_venue',VENUE_DB_USER:'usd_venue',VENUE_DB_PASSWORD:'local-test-password',
};
function database(options={}){
 const history=[];
 const role={id:'role-id',key:'venue-judge',isSystem:true,permissions:VENUE_JUDGE_PERMISSIONS};
 const tx={
  $executeRawUnsafe:async sql=>{assert.match(sql,/advisory_xact_lock/);history.push('lock')},
  stage:{
   count:async()=>options.stages??1,
   findFirst:async()=>options.stageExists===false?null:{id:STAGE,isDeleted:false,status:'PUBLISHED'},
  },
  user:{
   count:async()=>options.foreignUsers??0,
   findUnique:async()=>options.duplicate?{id:'old'}:null,
   create:async ({data})=>{history.push(['user',data]);return {id:'user-1',...data}},
  },
  role:{
   findUnique:async()=>options.roleMissing?null:(options.badRole?{...role,permissions:{results:['delete']}}:role),
   create:async ({data})=>{history.push(['role',data]);return {id:'role-id',...data}},
  },
  auditLog:{
   create:async ({data})=>{history.push(['audit',data]);return {id:'log'}},
  },
 };
 const client={$transaction:async (fn,opts)=>{assert.equal(opts.isolationLevel,'Serializable');return fn(tx)}};
 return {client,history};
}
test('staff handles are explicit, local-only and never use real email addresses',()=>{
 const admin=planVenueStaff('admin','operator1',env);
 const judge=planVenueStaff('judge','judge-01',env);
 assert.equal(admin.email,'operator1@venue.invalid');
 assert.equal(admin.role,'ADMIN');
 assert.equal(judge.email,'judge-01@venue.invalid');
 assert.equal(judge.role,'PARTICIPANT');
 assert.equal(judge.customRoleKey,'venue-judge');
});
test('invalid handles, commands, online env and external database are refused before connecting',()=>{
 for(const handle of ['admin','a','USER','john@example.com','__proto__','user/name','user space']){
  assert.throws(()=>planVenueStaff('judge',handle,env));
 }
 assert.throws(()=>planVenueStaff('superuser','hacker1',env));
 assert.throws(()=>planVenueStaff('admin','operator1',{...env,USD_VENUE_LAN_MODE:'false'}));
 assert.throws(()=>planVenueStaff('admin','operator1',{...env,DATABASE_URL:'postgresql://usd:pwd@api.usd-russia.ru:5432/usd'}));
});
test('judge permissions give check-in, inspections and result creation, NEVER result correction or settings',()=>{
 const perms=VENUE_JUDGE_PERMISSIONS;
 assert.deepEqual(perms.results,['view','create']);
 assert.deepEqual(perms.inspections,['view','create','update']);
 assert.deepEqual(perms.registrations,['view','create','update']);
 for(const denied of ['delete','update'])assert.equal(perms.results.includes(denied),false);
 for(const denied of ['users','siteSettings','integrations','assistant','notifications','imports'])
  assert.equal(Object.hasOwn(perms,denied),false);
});
test('strong password is mandatory, no hashes or user create for invalid passwords',async()=>{
 const p=planVenueStaff('judge','judge-01',env);
 const {client,history}=database();
 for(const password of ['short','aaaaaaaaaaaaaaaa','passwordpassword','1234567890123456','samePassword   ']){
  await assert.rejects(()=>provisionVenueStaff(p,password,client,async()=> 'hash'),/парол/i);
 }
 assert.equal(history.length,0);
});
test('supervised admin enrollment creates only a local ADMIN and sanitized audit',async()=>{
 const p=planVenueStaff('admin','operator1',env);
 const {client,history}=database();
 const result=await provisionVenueStaff(p,'Venue-Admin!Strong#17',client,async x=>'BCRYPT:'+x.length);
 assert.deepEqual(result,{login:'operator1@venue.invalid',role:'ADMIN',stageId:STAGE});
 const user=history.find(x=>Array.isArray(x)&&x[0]==='user')[1];
 assert.equal(user.role,'ADMIN');
 assert.equal(user.customRoleId,null);
 assert.equal(user.passwordHash,'BCRYPT:21');
 assert.ok(user.emailVerifiedAt instanceof Date);
 const log=history.find(x=>Array.isArray(x)&&x[0]==='audit')[1];
 assert.equal(log.action,'VENUE_STAFF_CREATED');
 assert.ok(!JSON.stringify(log).includes('Venue-Admin!Strong#17'));
 assert.ok(!JSON.stringify(log).includes('operator1@venue.invalid'));
});
test('judge enrollment uses a fixed system custom role and is not ADMIN',async()=>{
 const p=planVenueStaff('judge','judge-01',env);
 const {client,history}=database({roleMissing:true});
 const result=await provisionVenueStaff(p,'Venue-Judge!Strong#17',client,async()=> 'bcrypt-mock');
 assert.deepEqual(result,{login:'judge-01@venue.invalid',role:'JUDGE',stageId:STAGE});
 const role=history.find(x=>Array.isArray(x)&&x[0]==='role')[1];
 assert.deepEqual(role.permissions,VENUE_JUDGE_PERMISSIONS);
 assert.equal(role.isSystem,true);
 const user=history.find(x=>Array.isArray(x)&&x[0]==='user')[1];
 assert.equal(user.role,'PARTICIPANT');
 assert.equal(user.customRoleId,'role-id');
});
test('foreign users, missing pinned stage and duplicate login abort before writes',async()=>{
 for(const options of [{foreignUsers:1},{stages:2},{stageExists:false},{duplicate:true},{badRole:true}]){
  const {client,history}=database(options);
  await assert.rejects(()=>provisionVenueStaff(planVenueStaff('judge','judge-01',env),
   'Venue-Judge!Strong#17',client,async()=> 'hash'));
  assert.equal(history.some(x=>Array.isArray(x)&&x[0]==='user'),false);
 }
});
test('transaction and bcrypt failure are surfaced; no success or account after throw',async()=>{
 const {client,history}=database();
 await assert.rejects(()=>provisionVenueStaff(planVenueStaff('admin','operator1',env),
  'Venue-Admin!Strong#17',client,async()=>{throw Error('bcrypt failure')}),/bcrypt failure/);
 assert.equal(history.some(x=>Array.isArray(x)&&x[0]==='user'),false);
});
