#!/usr/bin/env node
/** Enable the SAME online USD user UUIDs/emails/passwords on the isolated LAN.
 * Signed stage contains AES-GCM ciphertext only; decryption key travels in a
 * separate private file and is NEVER included in the source stage snapshot.
 * Only the fixed competition-permission subset is installed for judges.
 */
import {createDecipheriv} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertVenueImportEnvironment,assertVenueDatabaseRole} from './import-stage.mjs';
import {verifyVenueStageHandoff} from './verify-stage-package.mjs';
import {VENUE_JUDGE_PERMISSIONS} from './provision-staff.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BCRYPT=/^\$2[aby]\$[0-3][0-9]\$[./A-Za-z0-9]{53}$/;
const KEY=/^[A-Za-z0-9_-]{43}$/;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hasAction=(src,action)=>Array.isArray(src)?src.includes(action)||src.includes('*')
 :isObject(src)&&(src[action]===true||src[action]==='*');
function scopedPermissions(input){
 if(!isObject(input))throw new Error('Некорректные права сотрудника');
 const out={};
 for(const [module,allowed] of Object.entries(VENUE_JUDGE_PERMISSIONS)){
  const actions=allowed.filter(action=>hasAction(input[module],action));
  if(actions.length)out[module]=actions;
 }
 if(!['registrations','inspections','results'].some(m=>out[m]?.includes('view')))
  throw new Error('У сотрудника нет прав на работу с этапом');
 return out;
}
function verifyUsers(users){
 if(!Array.isArray(users)||users.length<1||users.length>40)
  throw new Error('Недопустимый состав сотрудников');
 const ids=new Set(),emails=new Set(),roles=new Map();
 let administrators=0;
 return users.map(u=>{
  if(!isObject(u)||!UUID.test(u.id)||!u.isActive
   ||typeof u.email!=='string'||!/^\S+@\S+\.\S+$/.test(u.email)
   ||u.email.toLowerCase().endsWith('@venue.invalid')||!BCRYPT.test(u.passwordHash)
   ||!Number.isFinite(Date.parse(u.emailVerifiedAt??'')))
   throw new Error('Некорректный пользователь или хеш пароля');
  const email=u.email.trim().toLowerCase();
  if(ids.has(u.id)||emails.has(email))throw new Error('Повтор сотрудника');
  ids.add(u.id);emails.add(email);
  if(u.role==='ADMIN'){
   administrators++;
   if(u.customRole!==null&&u.customRole!==undefined)
    throw new Error('Некорректная роль администратора');
   return {id:u.id,email,name:u.name??null,role:'ADMIN',passwordHash:u.passwordHash,
    isActive:true,emailVerifiedAt:new Date(u.emailVerifiedAt),customRole:null};
  }
  const role=u.customRole;
  if(u.role!=='PARTICIPANT'||!isObject(role)||!UUID.test(role.id)
   ||typeof role.key!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(role.key)
   ||typeof role.name!=='string'||!role.name.trim()||role.name.length>100)
   throw new Error('Неверная роль сотрудника');
  const permissions=scopedPermissions(role.permissions);
  const original=roles.get(role.id);
  if(original&&JSON.stringify(original)!==JSON.stringify({key:role.key,permissions}))
   throw new Error('Конфликт прав одного судейского профиля');
  roles.set(role.id,{key:role.key,permissions});
  return {id:u.id,email,name:u.name??null,role:'PARTICIPANT',
   passwordHash:u.passwordHash,isActive:true,emailVerifiedAt:new Date(u.emailVerifiedAt),
   customRole:{id:role.id,key:role.key,name:role.name.trim(),permissions}};
 }).map((u,i,list)=>{
  if(i===list.length-1&&administrators<1)throw new Error('Требуется администратор USD');
  return u;
 });
}
export function decryptExistingVenueStaff(sealed,key,stageId){
 if(!UUID.test(stageId)||!isObject(sealed)||sealed.format!==1
  ||sealed.algorithm!=='AES-256-GCM'||typeof key!=='string'||!KEY.test(key)
  ||typeof sealed.nonce!=='string'||typeof sealed.tag!=='string'
  ||typeof sealed.ciphertext!=='string'
  ||!/^[A-Za-z0-9_-]{16}$/.test(sealed.nonce)
  ||!/^[A-Za-z0-9_-]{22}$/.test(sealed.tag)
  ||!/^[A-Za-z0-9_-]{10,130000}$/.test(sealed.ciphertext))
  throw new Error('Некорректный ключ или пакет доступа сотрудников');
 let users;
 try{
  const secret=Buffer.from(key,'base64url'),nonce=Buffer.from(sealed.nonce,'base64url');
  if(secret.length!==32||nonce.length!==12)throw new Error('key length');
  const decipher=createDecipheriv('aes-256-gcm',secret,nonce);
  decipher.setAAD(Buffer.from('USD_VENUE_STAFF_V1:'+stageId,'utf8'));
  decipher.setAuthTag(Buffer.from(sealed.tag,'base64url'));
  const content=Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext,'base64url')),decipher.final()]);
  if(content.length>48*1024)throw new Error('oversized');
  users=JSON.parse(content.toString('utf8'));
 }catch{
  throw new Error('Не удалось открыть шифр доступа сотрудников: неверный ключ или этап');
 }
 return verifyUsers(users);
}
function sameUser(actual,expected){
 return actual.id===expected.id&&actual.email===expected.email
  &&actual.passwordHash===expected.passwordHash&&actual.role===expected.role
  &&(actual.customRoleId??null)===(expected.customRole?.id??null)
  &&actual.isActive===true;
}
/** Serializable one-time install; replays after installer crash are read-only. */
export async function applyExistingVenueStaff(staff,stageId,prisma){
 if(!prisma||typeof prisma.$transaction!=='function'||!UUID.test(stageId))
  throw new Error('Неверная локальная база сотрудников');
 const candidates=verifyUsers(staff.map(u=>({...u,
  emailVerifiedAt:u.emailVerifiedAt instanceof Date?u.emailVerifiedAt.toISOString():u.emailVerifiedAt})));
 return prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(1827726188)');
  await assertVenueDatabaseRole(tx);
  const count=await tx.stage.count();
  const current=await tx.stage.findFirst({where:{id:stageId,isDeleted:false,
   status:{in:['PUBLISHED','COMPLETED']}},select:{id:true}});
  if(count!==1||!current)throw new Error('Подменён или отсутствует этап площадки');
  const existingCount=await tx.user.count();
  if(existingCount>0){
   const present=await tx.user.findMany({select:{id:true,email:true,passwordHash:true,
    role:true,customRoleId:true,isActive:true}});
   if(present.length!==candidates.length||!candidates.every(u=>present.some(x=>sameUser(x,u))))
    throw new Error('Посторонние учётные записи или конфликт сотрудников площадки');
   return {stageId,staffCount:candidates.length,replayed:true};
  }
  const roles=new Map(candidates.filter(u=>u.customRole).map(u=>[u.customRole.id,u.customRole]));
  for(const role of roles.values()){
   const prev=await tx.role.findUnique({where:{key:role.key}});
   if(prev)throw new Error('Судейская роль уже существует; повторная привязка запрещена');
   await tx.role.create({data:{id:role.id,key:role.key,name:role.name,
    permissions:role.permissions,isSystem:true,
    description:'Права текущего этапа из подписанного USD; только LAN'}});
  }
  for(const u of candidates){
   await tx.user.create({data:{id:u.id,email:u.email,name:u.name,
    passwordHash:u.passwordHash,role:u.role,isActive:true,
    emailVerifiedAt:u.emailVerifiedAt,
    customRoleId:u.customRole?.id??null}});
  }
  await tx.auditLog.create({data:{action:'VENUE_EXISTING_STAFF_ENABLED',
   entity:'Stage',entityId:stageId,metadata:{staffCount:candidates.length,source:'central-sealed'}}});
  return {stageId,staffCount:candidates.length,replayed:false};
 },{isolationLevel:'Serializable',timeout:30000});
}

async function main(){
 const [file,keyFile,secretFile,...extra]=process.argv.slice(2);
 if(!file||!keyFile||!secretFile||extra.length)
  throw new Error('Usage: provision-existing-staff.mjs STAGE.json PUBLIC.pem ACCESS.key');
 if((await stat(file)).size>12*1024*1024+262144||(await stat(secretFile)).size>512)
  throw new Error('Некорректный размер пакета сотрудников');
 const [raw,pem,key]=await Promise.all([readFile(file,'utf8'),readFile(keyFile,'utf8'),readFile(secretFile,'utf8')]);
 const signed=JSON.parse(raw),stageId=process.env.VENUE_STAGE_ID;
 assertVenueImportEnvironment(process.env,stageId);
 const verified=verifyVenueStageHandoff(signed,pem);
 if(verified.stageId!==stageId||!signed.snapshot.staffAccess)
  throw new Error('Пакет не предназначен для входа существующих сотрудников');
 const staff=decryptExistingVenueStaff(signed.snapshot.staffAccess,key.trim(),stageId);
 const require=createRequire(import.meta.url);
 const {PrismaPg}=require('@prisma/adapter-pg');
 const {PrismaClient}=require('/app/dist/generated/prisma/client.js');
 const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{
  const result=await applyExistingVenueStaff(staff,stageId,prisma);
  process.stdout.write('USD EXISTING STAFF READY: '+result.staffCount+' accounts\n');
 }finally{await prisma.$disconnect()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{
  console.error('USD VENUE STAFF REFUSED: check signed package, independent key and local stage DB');
  process.exitCode=1;
 });
}
