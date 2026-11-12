#!/usr/bin/env node
/** One-time local venue ADMIN/JUDGE enrollment into the isolated USD database.
 * Never copies online identities, emails, passwords, JWTs or custom roles.
 * Run only inside the trusted usd-venue API image with password on stdin.
 */
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertVenueImportEnvironment,assertVenueDatabaseRole} from './import-stage.mjs';

// Deliberately narrower than online ADMIN custom roles. The normal backend
// RolesGuard also prohibits judges from UPDATE/DELETE of results.
export const VENUE_JUDGE_PERMISSIONS=Object.freeze({
  stages:['view'],
  registrations:['view','create','update'],
  inspections:['view','create','update'],
  results:['view','create'],
  participants:['view','create'],
  cars:['view','create'],
  classes:['view'],
  configurations:['view','create','update'],
  records:['view'],
});
const NAME=/^[a-z][a-z0-9-]{5,23}$/;
const RESERVED=new Set(['system','root00','public','online','master','server','source']);
const VENUE_ROLE_KEY='venue-judge';
const STATUS_MESSAGE='VENUE STAFF REFUSED: check pinned venue DB, stage, login, local role and password';

function safePassword(password){
 if(typeof password!=='string'||password.length<16||password.length>128
  ||/\s/.test(password)
  ||!/[a-z]/.test(password)||!/[A-Z]/.test(password)
  ||!/[0-9]/.test(password)||!/[!@#$%^&*()_+\-=[\]{};:,.?]/.test(password))
  throw new Error('Требуется надёжный пароль длиной 16–128 символов: верхний/нижний регистр, цифра и спецсимвол, без пробелов');
}

/** Safe to call without connecting to DB; caller's environment is validated. */
export function planVenueStaff(kind,handle,env){
 if(!['admin','judge'].includes(kind)||typeof handle!=='string'
  ||!NAME.test(handle)||RESERVED.has(handle))
  throw new Error('Недопустимое имя локального сотрудника');
 const stageId=env.VENUE_STAGE_ID;
 assertVenueImportEnvironment(env,stageId);
 return Object.freeze({
  stageId,kind,email:handle+'@venue.invalid',
  role:kind==='admin'?'ADMIN':'PARTICIPANT',
  ...(kind==='judge'?{customRoleKey:VENUE_ROLE_KEY}:{}),
 });
}
function sameFixedPermissionMap(actual){
 if(!actual||typeof actual!=='object'||Array.isArray(actual))return false;
 const expected=VENUE_JUDGE_PERMISSIONS;
 const keys=Object.keys(actual),expectedKeys=Object.keys(expected);
 return keys.length===expectedKeys.length
  &&expectedKeys.every(key=>Array.isArray(actual[key])
   &&actual[key].length===expected[key].length
   &&expected[key].every(action=>actual[key].includes(action)));
}

/** All database checks + writes are protected by one transaction.
 * Never modifies existing user accounts or changes their existing roles.
 */
export async function provisionVenueStaff(plan,password,prisma,hashPassword){
 if(!plan?.stageId||!['admin','judge'].includes(plan.kind)
  ||plan.email?.split('@').length!==2
  ||plan.email?.split('@')[1]!=='venue.invalid'
  ||plan.role!==(plan.kind==='admin'?'ADMIN':'PARTICIPANT')
  ||typeof prisma?.$transaction!=='function'
  ||typeof hashPassword!=='function')
  throw new Error('Неверные параметры создания локальной учётной записи');
 safePassword(password);
 const passwordHash=await hashPassword(password);
 if(typeof passwordHash!=='string'||passwordHash.length<4)
  throw new Error('Неверный результат хеширования пароля');
 return prisma.$transaction(async tx=>{
  // Only static SQL without user-controlled interpolation.
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(1827726188)');
  await assertVenueDatabaseRole(tx);
  if(await tx.stage.count()!==1)
   throw new Error('Локальная база должна содержать строго один этап');
  const current=await tx.stage.findFirst({
   where:{id:plan.stageId,isDeleted:false,status:{in:['PUBLISHED','COMPLETED']}},
   select:{id:true},
  });
  if(!current)throw new Error('Закреплённый этап отсутствует в базе площадки');
  // A restored production DB must not silently become a venue identity store.
  if(await tx.user.count({where:{NOT:{email:{endsWith:'@venue.invalid'}}}})>0)
   throw new Error('В локальной базе присутствуют посторонние пользователи');
  const existing=await tx.user.findUnique({where:{email:plan.email},select:{id:true}});
  if(existing)throw new Error('Локальная учётная запись уже существует — не изменять пароль молча');
  let customRoleId=null;
  if(plan.kind==='judge'){
   let judge=await tx.role.findUnique({where:{key:VENUE_ROLE_KEY}});
   if(judge){
    if(!judge.isSystem||!sameFixedPermissionMap(judge.permissions))
     throw new Error('Локальная судейская роль изменена или повреждена');
   }else{
    judge=await tx.role.create({data:{
     key:VENUE_ROLE_KEY,name:'Судья площадки USD',isSystem:true,
     description:'Изолированная LAN-роль судьи; без администрирования USD и редактирования результатов',
     permissions:VENUE_JUDGE_PERMISSIONS,
    }});
   }
   customRoleId=judge.id;
  }
  const user=await tx.user.create({data:{
   email:plan.email,role:plan.role,customRoleId,
   passwordHash,name:plan.kind==='admin'?'Администратор площадки':'Судья площадки',
   isActive:true,
   // Locally provisioned synthetic @venue.invalid address: NEVER send email.
   // This date is an offline authorization assertion, not mailbox verification.
   emailVerifiedAt:new Date(),
  },select:{id:true}});
  await tx.auditLog.create({data:{
   userId:user.id,action:'VENUE_STAFF_CREATED',entity:'User',entityId:user.id,
   metadata:{stageId:plan.stageId,kind:plan.kind,role:plan.role,localOnly:true},
  }});
  return {login:plan.email,role:plan.kind==='admin'?'ADMIN':'JUDGE',stageId:plan.stageId};
 },{isolationLevel:'Serializable',timeout:30000});
}

async function readPasswordFromStdin(){
 let secret='';
 for await(const chunk of process.stdin){
  secret+=chunk.toString('utf8');
  if(secret.length>4096)throw new Error('Пароль превышает лимит ввода');
 }
 return secret.replace(/\r?\n$/,'');
}
async function main(){
 const [kind,handle,...extra]=process.argv.slice(2);
 if(extra.length||!kind||!handle)
  throw new Error('Usage: node provision-staff.mjs admin|judge LOGIN_NAME (password on stdin)');
 const plan=planVenueStaff(kind,handle,process.env);
 const password=await readPasswordFromStdin();
 safePassword(password);
 // Load DB and bcrypt only after venue restrictions and password checks.
 const require=createRequire(import.meta.url);
 const {PrismaPg}=require('@prisma/adapter-pg');
 const {PrismaClient}=require('/app/dist/generated/prisma/client.js');
 const bcrypt=require('bcrypt');
 const client=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{
  const result=await provisionVenueStaff(plan,password,client,text=>bcrypt.hash(text,12));
  process.stdout.write('USD VENUE STAFF CREATED — ISOLATED LAPTOP ONLY\n');
  process.stdout.write(JSON.stringify(result)+'\n');
 }finally{await client.$disconnect()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{
  // Avoid echoing passwords, DB connection strings or staff rosters.
  console.error(STATUS_MESSAGE);
  process.exitCode=1;
 });
}
