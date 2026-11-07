import {jest} from '@jest/globals';
import {AuthService} from './auth.service';
import {ConflictException,ForbiddenException,UnauthorizedException} from '@nestjs/common';

const userId='123e4567-e89b-42d3-a456-426614174001';
const participantId='123e4567-e89b-42d3-a456-426614174002';

describe('Historical self-link is verified and serialized with admin claims',()=>{
 const makeDb=()=>{
  const db:any={
   $executeRaw:jest.fn(async()=>0),
   user:{
    findUnique:jest.fn(async()=>({id:userId,email:'claimed@example.org',emailVerifiedAt:new Date(),isActive:true,participantId:null})),
    update:jest.fn(async()=>({id:userId,participantId})),
   },
   participant:{findUnique:jest.fn(async()=>({id:participantId,user:null}))},
   participantLegacyEmail:{findUnique:jest.fn(async()=>({email:'claimed@example.org'}))},
   auditLog:{create:jest.fn(async()=>({id:'audit'}))},
  };
  db.$transaction=jest.fn(async(fn:any)=>fn(db));
  const service=Object.create(AuthService.prototype) as AuthService;
  (service as any).prisma=db;
  return {db,service};
 };
 it('never links a matching legacy email if it has not been verified',async()=>{
  const {db,service}=makeDb();
  db.user.findUnique.mockResolvedValueOnce({id:userId,email:'claimed@example.org',isActive:true,emailVerifiedAt:null,participantId:null});
  await expect(service.linkHistoricalProfile(userId,participantId)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(db.user.update).not.toHaveBeenCalled();
  expect(db.auditLog.create).not.toHaveBeenCalled();
 });
 it('rejects disabled users and never modifies the participant',async()=>{
  const {db,service}=makeDb();
  db.user.findUnique.mockResolvedValueOnce({id:userId,email:'claimed@example.org',isActive:false,emailVerifiedAt:new Date(),participantId:null});
  await expect(service.linkHistoricalProfile(userId,participantId)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(db.user.update).not.toHaveBeenCalled();
 });
 it('uses same participant-claim and claimant-user advisory locks as admin review',async()=>{
  const {db,service}=makeDb();
  const result=await service.linkHistoricalProfile(userId,participantId);
  expect(result).toEqual({success:true,linked:true,participantId});
  expect(db.$executeRaw).toHaveBeenCalledTimes(2);
  expect(db.$executeRaw.mock.invocationCallOrder[1]).toBeLessThan(db.user.update.mock.invocationCallOrder[0]);
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({action:'PARTICIPANT_PROFILE_LINKED',metadata:{source:'HISTORICAL_MATCH'}}),
  }));
 });
 it('self-linking does not steal profiles already owned by another account',async()=>{
  const {db,service}=makeDb();
  db.participant.findUnique.mockResolvedValueOnce({id:participantId,user:{id:'other-user'}});
  await expect(service.linkHistoricalProfile(userId,participantId)).rejects.toBeInstanceOf(ConflictException);
  expect(db.user.update).not.toHaveBeenCalled();
 });
 it('never links when the stored legacy email differs from verified account',async()=>{
  const {db,service}=makeDb();
  db.participantLegacyEmail.findUnique.mockResolvedValueOnce({email:'stranger@example.org'});
  await expect(service.linkHistoricalProfile(userId,participantId)).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.user.update).not.toHaveBeenCalled();
 });
 it('preserves idempotent re-opening of the already linked profile',async()=>{
  const {db,service}=makeDb();
  db.user.findUnique.mockResolvedValueOnce({id:userId,email:'claimed@example.org',emailVerifiedAt:new Date(),isActive:true,participantId});
  expect(await service.linkHistoricalProfile(userId,participantId)).toEqual({success:true,linked:true,participantId});
  expect(db.user.update).not.toHaveBeenCalled();
 });
});
