import {jest} from '@jest/globals';
import {ProfileMergeService} from './profile-merge.service';
import {BadRequestException,NotFoundException} from '@nestjs/common';

const a='123e4567-e89b-42d3-a456-426614174001',b='123e4567-e89b-42d3-a456-426614174002';
const person=(id:string)=>({
 id,firstName:'Иван',lastName:'Иванов',middleName:null,birthDate:null,
 phone:null,photoUrl:null,city:null,team:null,legacyId:null,usdIdToken:null,isPublic:true,
 user:null,teamMembership:null,cars:[],registrations:[],stageInspections:[],
});
describe('read-only merge readiness is a safe, PII-free hint, never an approval',()=>{
 const makeDb=()=>{
  const db:any={
   participant:{findMany:jest.fn(async()=>[person(a),person(b)]),update:jest.fn()},
   participantLegacyEmail:{findMany:jest.fn(async()=>[])},
   profileLinkRequest:{findMany:jest.fn(async()=>[])},
   participantMergeRedirect:{findMany:jest.fn(async()=>[]),create:jest.fn()},
   auditLog:{create:jest.fn()},$transaction:jest.fn(),
  };return db;
 };
 it('indicates safety for compatible pairs without touching the database',async()=>{
  const db=makeDb(),result=await new ProfileMergeService(db).readiness(a,b);
  expect(result).toEqual({state:'READ_ONLY',canMergeNow:true,conflicts:[]});
  expect(db.participant.update).not.toHaveBeenCalled();
  expect(db.participantMergeRedirect.create).not.toHaveBeenCalled();
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('returns a conflict instead of calling the merge when a claim is pending',async()=>{
  const db=makeDb();
  db.profileLinkRequest.findMany.mockResolvedValue([{participantId:a}]);
  const status=await new ProfileMergeService(db).readiness(a,b);
  expect(status.canMergeNow).toBe(false);
  expect(status.conflicts.map((x:{code:string})=>x.code)).toContain('PENDING_CLAIM');
  expect(JSON.stringify(status)).not.toContain('@');
 });
 it('blocks any identity already involved in a previous merge',async()=>{
  const db=makeDb();
  db.participantMergeRedirect.findMany.mockResolvedValue([{sourceId:a}]);
  const status=await new ProfileMergeService(db).readiness(a,b);
  expect(status.conflicts.map((x:{code:string})=>x.code)).toContain('MERGED_PROFILE');
 });
 it('rejects a dormant or unverified target account before an identity merge',async()=>{
  const db=makeDb();
  db.participant.findMany.mockResolvedValue([
   person(a),{...person(b),user:{id:'dormant-owner',isActive:false,emailVerifiedAt:null}},
  ]);
  const result=await new ProfileMergeService(db).readiness(a,b);
  expect(result.canMergeNow).toBe(false);
  expect(result.conflicts.map((conflict:{code:string})=>conflict.code)).toContain('ACCOUNT_NOT_VERIFIED');
  expect(db.participantMergeRedirect.create).not.toHaveBeenCalled();
 });
 it('does not issue a query for malformed ID or a self-merge',async()=>{
  const db=makeDb(),service=new ProfileMergeService(db);
  await expect(service.readiness('bad',b)).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.readiness(a,a)).rejects.toBeInstanceOf(BadRequestException);
  expect(db.participant.findMany).not.toHaveBeenCalled();
 });
 it('returns no partial details when one profile does not exist',async()=>{
  const db=makeDb();db.participant.findMany.mockResolvedValue([person(a)]);
  await expect(new ProfileMergeService(db).readiness(a,b)).rejects.toBeInstanceOf(NotFoundException);
 });
});
