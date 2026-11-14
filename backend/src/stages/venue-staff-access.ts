import {createCipheriv,randomBytes} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BCRYPT=/^\$2[aby]\$[0-3][0-9]\$[./A-Za-z0-9]{53}$/;
const MAX_STAFF=40;
export type VenueStaffIdentity={
 id:string;email:string;name:string|null;role:string;passwordHash:string;
 isActive:boolean;emailVerifiedAt:Date|string|null;customRoleId?:string|null;
 customRole?:{id:string;key:string;name:string;permissions:unknown}|null;
};
export type SealedVenueStaff={
 format:1;algorithm:'AES-256-GCM';nonce:string;ciphertext:string;tag:string;
};

/** Select only staff who are able to judge an event. No participant accounts. */
export function eligibleVenueStaff<T extends VenueStaffIdentity>(all:T[]):T[]{
 return all.filter(user=>{
  if(!user.isActive||!user.emailVerifiedAt)return false;
  if(user.role==='ADMIN')return true;
  const permissions=user.customRole?.permissions;
  if(user.role!=='PARTICIPANT'||!permissions||typeof permissions!=='object')return false;
  const allowed=permissions as Record<string,unknown>;
  return ['registrations','inspections','results'].some(module=>{
   const value=allowed[module];
   return Array.isArray(value)&&(value.includes('view')||value.includes('*'))
    ||Boolean(value&&typeof value==='object'&&!Array.isArray(value)
     &&([true,'*'].includes((value as Record<string,unknown>).view as string|boolean)));
  });
 }).sort((a,b)=>(a.role==='ADMIN'?0:1)-(b.role==='ADMIN'?0:1)||a.email.localeCompare(b.email));
}
/** Session-specific 256-bit key is returned OUTSIDE the signed stage snapshot;
 * never log it, append it to URLs, or store it in the central DB.
 */
export function sealVenueStaffAccess(stageId:string,staff:VenueStaffIdentity[]):{
 staffAccess:SealedVenueStaff;staffKey:string;
}{
 if(!UUID.test(stageId)||!Array.isArray(staff)||staff.length<1||staff.length>MAX_STAFF)
  throw new Error('Недопустимый состав сотрудников этапа');
 const ids=new Set<string>(),emails=new Set<string>();
 let adminCount=0;
 for(const u of staff){
  if(!UUID.test(u.id)||!u.isActive||!u.emailVerifiedAt
   ||typeof u.email!=='string'||!/^\S+@\S+\.\S+$/.test(u.email)
   ||u.email.endsWith('@venue.invalid')||!BCRYPT.test(u.passwordHash))
   throw new Error('Неактивный сотрудник или неверный идентификатор/пароль');
  const normalized=u.email.toLowerCase();
  if(ids.has(u.id)||emails.has(normalized))throw new Error('Повтор сотрудника');
  ids.add(u.id);emails.add(normalized);
  if(u.role==='ADMIN'){adminCount++;continue}
  if(u.role!=='PARTICIPANT'||!UUID.test(u.customRole?.id??'')
   ||typeof u.customRole?.key!=='string'||!u.customRole.key
   ||!eligibleVenueStaff([u]).length)throw new Error('Сотрудник не имеет судейских прав');
 }
 if(!adminCount)throw new Error('В пакете должен быть хотя бы один администратор');
 const secret=randomBytes(32),nonce=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',secret,nonce);
 cipher.setAAD(Buffer.from('USD_VENUE_STAFF_V1:'+stageId,'utf8'));
 const bytes=Buffer.from(JSON.stringify(staff.map(u=>({
  id:u.id,email:u.email.toLowerCase(),name:u.name??null,role:u.role,
  passwordHash:u.passwordHash,isActive:true,emailVerifiedAt:u.emailVerifiedAt,
  customRole:u.role==='ADMIN'?null:u.customRole,
 }))),'utf8');
 if(bytes.length>48*1024)throw new Error('Слишком большой список сотрудников');
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return {staffAccess:{format:1,algorithm:'AES-256-GCM',
  nonce:nonce.toString('base64url'),ciphertext:ciphertext.toString('base64url'),
  tag:cipher.getAuthTag().toString('base64url')},staffKey:secret.toString('base64url')};
}

/** The only place that may read bcrypt verifiers for offline transfer.
 * The event roster itself and the signed stage service never receive or
 * serialize raw password verifiers. All users are encrypted before return.
 */
export async function prepareVenueStaffExport(
 prisma:import('../prisma/prisma.service').PrismaService,
 stageId:string,
 operatorId:string,
){
 const {ServiceUnavailableException}=await import('@nestjs/common');
 const candidates=await prisma.user.findMany({
  where:{isActive:true,emailVerifiedAt:{not:null},OR:[{role:'ADMIN'},{customRoleId:{not:null}}]},
  select:{id:true,email:true,name:true,role:true,passwordHash:true,isActive:true,
   emailVerifiedAt:true,customRoleId:true,
   customRole:{select:{id:true,key:true,name:true,permissions:true}}},
  take:1001,
 });
 // Truncating a roster would strand a judge at the event without access.
 if(candidates.length>1000)
  throw new ServiceUnavailableException('Слишком много сотрудников для офлайн-экспорта; уточните состав ролей');
 const staff=eligibleVenueStaff(candidates);
 if(!staff.some(u=>u.id===operatorId)||staff.length<1||staff.length>MAX_STAFF)
  throw new ServiceUnavailableException('Не удалось собрать безопасный список судей и администратора для площадки');
 try{
  const sealed=sealVenueStaffAccess(stageId,staff);
  return {...sealed,staffCount:staff.length};
 }catch{
  throw new ServiceUnavailableException('Подготовка защищённого списка судей не удалась');
 }
}
