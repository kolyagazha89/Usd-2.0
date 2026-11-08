import {jest} from '@jest/globals';
import {AuthService} from './auth.service';
import {ConflictException,ForbiddenException,UnauthorizedException} from '@nestjs/common';

const userId='123e4567-e89b-42d3-a456-426614174010';
const participantId='123e4567-e89b-42d3-a456-426614174011';
const email='verified@example.com';

describe('historical-email claim must serialize against administrative claims',()=>{
 const makeDb=()=>{
  const tx:any={
   $executeRaw:jest.fn(async()=>0),
   user:{
    findUnique:jest.fn(async()=>({id:userId,email,participantId:null,role:'PARTICIPANT',isActive:true,emailVerifiedAt:new Date(),customRoleId:null})),
    updateMany:jest.fn(async()=>({count:1})),
    update:jest.fn(async()=>({id:userId})),
   },
   participant:{findUnique:jest.fn(async()=>({id:participantId,user:null}))},
   participantLegacyEmail:{findUnique:jest.fn(async()=>({email}))},
   auditLog:{create:jest.fn(async()=>({id:'audit'}))},
  };
  const db:any={$transaction:jest.fn(async(callback:any)=>callback(tx))};
  const service=Object.create(AuthService.prototype) as AuthService;
  (service as any).prisma=db;
  return {service,db,tx};
 };
 it('locks historical participant before claimant, checks verified email and guards final write',async()=>{
  const {service,tx}=makeDb();
  await expect(service.linkHistoricalProfile(userId,participantId)).resolves.toEqual({success:true,linked:true,participantId});
  expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  expect(tx.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({select:expect.objectContaining({emailVerifiedAt:true,isActive:true})}));
  expect(tx.user.updateMany).toHaveBeenCalledWith({
   where:{id:userId,participantId:null,isActive:true,emailVerifiedAt:{not:null}},
   data:{participantId},
  });
  expect(tx.user.update).not.toHaveBeenCalled();
  expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
 });
 it('blocks a race when another claim linked the account after ownership verification',async()=>{
  const {service,tx}=makeDb();
  tx.user.updateMany.mockResolvedValueOnce({count:0});
  await expect(service.linkHistoricalProfile(userId,participantId)).rejects.toBeInstanceOf(ConflictException);
  expect(tx.auditLog.create).not.toHaveBeenCalled();
  expect(tx.user.update).not.toHaveBeenCalled();
 });

 it('links a verified email with case/whitespace differences without creating an admin request',async()=>{
  const {service,tx}=makeDb();
  tx.user.findUnique.mockResolvedValueOnce({id:userId,email:' VERIFIED@EXAMPLE.COM ',isActive:true,emailVerifiedAt:new Date(),participantId:null});
  tx.participantLegacyEmail.findUnique.mockResolvedValueOnce({email:' verified@example.com '});
  await expect(service.linkHistoricalProfile(userId,participantId)).resolves.toEqual({success:true,linked:true,participantId});
  expect(tx.user.updateMany).toHaveBeenCalledTimes(1);
  expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
 });
 it('refuses a profile without a trusted historical-email mapping instead of falsely treating name as proof',async()=>{
  const {service,tx}=makeDb();
  tx.participantLegacyEmail.findUnique.mockResolvedValueOnce(null);
  await expect(service.linkHistoricalProfile(userId,participantId)).rejects.toBeInstanceOf(ForbiddenException);
  expect(tx.user.updateMany).not.toHaveBeenCalled();
  expect(tx.auditLog.create).not.toHaveBeenCalled();
 });
 it('does not attach a profile whose historical email differs from the verified account',async()=>{
  const {service,tx}=makeDb();
  tx.participantLegacyEmail.findUnique.mockResolvedValueOnce({email:'someone-else@example.com'});
  await expect(service.linkHistoricalProfile(userId,participantId)).rejects.toBeInstanceOf(ForbiddenException);
  expect(tx.user.updateMany).not.toHaveBeenCalled();
 });

 it('never uses an unverified email as proof of historic profile ownership',async()=>{
  const {service,tx}=makeDb();
  tx.user.findUnique.mockResolvedValueOnce({id:userId,email,isActive:true,emailVerifiedAt:null,participantId:null});
  await expect(service.linkHistoricalProfile(userId,participantId)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(tx.user.updateMany).not.toHaveBeenCalled();
  expect(tx.auditLog.create).not.toHaveBeenCalled();
 });
});
