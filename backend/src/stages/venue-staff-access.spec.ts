import {createDecipheriv} from 'node:crypto';
import {sealVenueStaffAccess,eligibleVenueStaff} from './venue-staff-access';

const admin={
 id:'c510f672-79f7-44eb-8173-2a8ff94b1c0e',email:'administrator@usd.test',
 name:'Организатор',role:'ADMIN',passwordHash:'$2b$12$'+'A'.repeat(53),
 isActive:true,emailVerifiedAt:new Date('2026-11-01'),customRoleId:null,customRole:null,
};
const judge={
 id:'b510f672-79f7-44eb-8173-2a8ff94b1c0e',email:'judge@usd.test',
 name:'Судья',role:'PARTICIPANT',passwordHash:'$2b$12$'+'B'.repeat(53),
 isActive:true,emailVerifiedAt:new Date('2026-11-01'),
 customRoleId:'e510f672-79f7-44eb-8173-2a8ff94b1c0e',
 customRole:{id:'e510f672-79f7-44eb-8173-2a8ff94b1c0e',key:'judge',name:'Судья',
  permissions:{registrations:['view','create'],inspections:['view','create','update'],
   results:['view','create','update','delete'],siteSettings:['*']}},
};
const stage='d510f672-79f7-44eb-8173-2a8ff94b1c0e';
describe('AES-GCM staff admission for offline competition',()=>{
 it('uses real, active, verified online identities only',()=>{
  expect(eligibleVenueStaff([judge,admin])).toEqual([admin,judge]);
  expect(eligibleVenueStaff([judge,{...judge,isActive:false}, {...admin,emailVerifiedAt:null}])).toEqual([judge]);
 });
 it('never exports a plaintext password hash; returns a distinct single-use key',()=>{
  const {staffAccess,staffKey}=sealVenueStaffAccess(stage,[admin,judge]);
  const serialized=JSON.stringify(staffAccess);
  expect(staffKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(staffAccess).toMatchObject({format:1,algorithm:'AES-256-GCM'});
  expect(serialized).not.toContain(admin.email);
  expect(serialized).not.toContain(judge.email);
  expect(serialized).not.toContain(admin.passwordHash);
  expect(serialized).not.toContain(judge.passwordHash);
  expect(JSON.stringify(staffAccess).includes(staffKey)).toBe(false);
 });

 it('exports the historical USD judge role as a stable venue UUID without modifying the central identity',()=>{
  const historical={...judge,customRoleId:'usd-custom-role-judge',
   customRole:{...judge.customRole,id:'usd-custom-role-judge'}};
  const open=(sealed:ReturnType<typeof sealVenueStaffAccess>)=>{
   const {staffAccess,staffKey}=sealed;
   const decipher=createDecipheriv('aes-256-gcm',Buffer.from(staffKey,'base64url'),
    Buffer.from(staffAccess.nonce,'base64url'));
   decipher.setAAD(Buffer.from('USD_VENUE_STAFF_V1:'+stage));
   decipher.setAuthTag(Buffer.from(staffAccess.tag,'base64url'));
   return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(staffAccess.ciphertext,'base64url')),decipher.final(),
   ]).toString('utf8'));
  };
  const first=sealVenueStaffAccess(stage,[admin,historical]);
  const second=sealVenueStaffAccess(stage,[admin,historical]);
  const [firstAdmin,firstJudge]=open(first);
  expect(firstAdmin.id).toBe(admin.id);
  expect(firstJudge.id).toBe(judge.id);
  expect(firstJudge.customRole.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(firstJudge.customRole.id).toBe(open(second)[1].customRole.id);
  expect(firstJudge.customRole.key).toBe('judge');
  expect(firstJudge.customRole.permissions).toEqual(judge.customRole.permissions);
  expect(historical.customRole.id).toBe('usd-custom-role-judge');
  expect(JSON.stringify(first.staffAccess)).not.toContain('usd-custom-role-judge');
 });
 it('refuses unknown text role identifiers and spoofed legacy judge roles',()=>{
  const historical={...judge,customRoleId:'usd-custom-role-judge',
   customRole:{...judge.customRole,id:'usd-custom-role-judge'}};
  expect(()=>sealVenueStaffAccess(stage,[admin,{
   ...historical,customRole:{...historical.customRole,id:'other-text-role'},
  }])).toThrow('Сотрудник не имеет судейских прав');
  expect(()=>sealVenueStaffAccess(stage,[admin,{
   ...historical,customRole:{...historical.customRole,key:'untrusted'},
  }])).toThrow('Сотрудник не имеет судейских прав');
 });
 it('refuses unverified participant, unbounded roster and malformed hash',()=>{
  expect(()=>sealVenueStaffAccess(stage,[{...admin,role:'PARTICIPANT'}])).toThrow();
  expect(()=>sealVenueStaffAccess(stage,[{...judge,passwordHash:'plaintext'}])).toThrow();
  expect(()=>sealVenueStaffAccess(stage,Array.from({length:41},()=>judge))).toThrow();
 });
});
