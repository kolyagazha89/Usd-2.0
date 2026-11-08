import {jest} from '@jest/globals';
import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {ProfileLinksService} from './profile-links.service';

const uuid=(last:string)=>'123e4567-e89b-42d3-a456-'+last;
const claimantId=uuid('426614174001');
const participantId=uuid('426614174002');
const requestId=uuid('426614174003');
const reviewerId=uuid('426614174004');
const note='Участвовал на этапе 2025, автомобиль Lada.';

describe('secure manual profile link review',()=>{
 const makeDb=()=>{
  const db:any={
   user:{findUnique:jest.fn(async()=>({id:claimantId,emailVerifiedAt:new Date(),isActive:true,participantId:null})),update:jest.fn(async()=>({id:claimantId})),updateMany:jest.fn(async()=>({count:1}))},
   participant:{findUnique:jest.fn(async()=>({id:participantId,isPublic:true,user:null}))},
   profileLinkRequest:{
    findUnique:jest.fn(async()=>null),
    findMany:jest.fn(async()=>[]),
    count:jest.fn(async()=>0),
    create:jest.fn(async()=>({id:requestId,status:'PENDING'})),
    update:jest.fn(async()=>({id:requestId,status:'APPROVED',participantId})),
   },
   auditLog:{create:jest.fn(async()=>({id:requestId}))},
   $executeRaw:jest.fn(async()=>0),
  };
  db.$transaction=jest.fn(async(cb:any)=>cb(db));
  return db;
 };
 it('submits a request but never links an account without admin proof',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  const result=await service.submit(claimantId,participantId,note);
  expect(result).toEqual({success:true,id:requestId,status:'PENDING'});
  expect(db.user.update).not.toHaveBeenCalled();
  expect(db.profileLinkRequest.create).toHaveBeenCalledWith(expect.objectContaining({
   data:{claimantUserId:claimantId,participantId,note},
  }));
 });
 it('rejects unverified claimant and claimed or private profile',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.user.findUnique.mockResolvedValueOnce({id:claimantId,isActive:true,emailVerifiedAt:null,participantId:null});
  await expect(service.submit(claimantId,participantId,note)).rejects.toThrow();
  db.participant.findUnique.mockResolvedValueOnce({id:participantId,isPublic:false,user:null});
  await expect(service.submit(claimantId,participantId,note)).rejects.toBeInstanceOf(NotFoundException);
 });
 it('rate limits repeated requests and validates the ownership explanation',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.profileLinkRequest.count.mockResolvedValueOnce(3);
  await expect(service.submit(claimantId,participantId,note)).rejects.toBeInstanceOf(ConflictException);
  await expect(service.submit(claimantId,participantId,'short')).rejects.toBeInstanceOf(BadRequestException);
 });
 it('allows one-click administrative link with automatically recorded reason, atomically audited',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.profileLinkRequest.findUnique.mockResolvedValue({id:requestId,status:'PENDING',claimantUserId:claimantId,participantId});
  const response=await service.review(requestId,reviewerId,'APPROVE');
  expect(response.status).toBe('APPROVED');
  expect(db.user.updateMany).toHaveBeenCalledWith({where:{id:claimantId,participantId:null,isActive:true,emailVerifiedAt:{not:null}},data:{participantId}});
  expect(db.user.update).not.toHaveBeenCalled();
  // Request, historical participant AND claimant locks prevent competing
  // approvals that target separate participant IDs for the same account.
  expect(db.$executeRaw).toHaveBeenCalledTimes(3);
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({action:'PROFILE_LINK_APPROVED',entity:'ProfileLinkRequest',metadata:expect.objectContaining({reason:'ADMIN_VERIFIED',ownershipVerified:true})}),
  }));
 });
 it('refuses conflicts on changed ownership before modifying any profile',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.profileLinkRequest.findUnique.mockResolvedValue({id:requestId,status:'PENDING',claimantUserId:claimantId,participantId});
  db.participant.findUnique.mockResolvedValueOnce({id:participantId,user:{id:'someone-else'}});
  await expect(service.review(requestId,reviewerId,'APPROVE')).rejects.toBeInstanceOf(ConflictException);
  expect(db.user.update).not.toHaveBeenCalled();
 });
 it('rejection does not attach a profile',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.profileLinkRequest.findUnique.mockResolvedValue({id:requestId,status:'PENDING',claimantUserId:claimantId,participantId});
  await service.review(requestId,reviewerId,'REJECT');
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({metadata:expect.objectContaining({reason:'ADMIN_REJECTED'})})}));
  expect(db.user.update).not.toHaveBeenCalled();
  expect(db.profileLinkRequest.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'REJECTED'})}));
 });

 it('one-click approval rejects unverified accounts and occupied profiles',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.profileLinkRequest.findUnique.mockResolvedValue({id:requestId,status:'PENDING',claimantUserId:claimantId,participantId});
  db.user.findUnique.mockResolvedValueOnce({id:claimantId,emailVerifiedAt:null,isActive:true,participantId:null});
  await expect(service.review(requestId,reviewerId,'APPROVE')).rejects.toBeInstanceOf(ConflictException);
  db.participant.findUnique.mockResolvedValueOnce({id:participantId,user:{id:'already-attached'}});
  await expect(service.review(requestId,reviewerId,'APPROVE')).rejects.toBeInstanceOf(ConflictException);
  expect(db.user.updateMany).not.toHaveBeenCalled();
  expect(db.auditLog.create).not.toHaveBeenCalled();
 });

 it('does not steal a profile when another workflow attached the claimant after validation',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.profileLinkRequest.findUnique.mockResolvedValue({id:requestId,status:'PENDING',claimantUserId:claimantId,participantId});
  db.user.updateMany.mockResolvedValueOnce({count:0});
  await expect(service.review(requestId,reviewerId,'APPROVE')).rejects.toBeInstanceOf(ConflictException);
  expect(db.user.update).not.toHaveBeenCalled();
  expect(db.profileLinkRequest.update).not.toHaveBeenCalled();
  expect(db.auditLog.create).not.toHaveBeenCalled();
 });
 it('does not replay the approval mutation or audit on a reviewed request',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.profileLinkRequest.findUnique.mockResolvedValue({id:requestId,status:'APPROVED',claimantUserId:claimantId,participantId});
  await expect(service.review(requestId,reviewerId,'APPROVE')).rejects.toBeInstanceOf(ConflictException);
  expect(db.user.updateMany).not.toHaveBeenCalled();
  expect(db.profileLinkRequest.update).not.toHaveBeenCalled();
  expect(db.auditLog.create).not.toHaveBeenCalled();
 });


 it('serializes claim submissions before checking the 24-hour quota to stop concurrent bypass',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  await service.submit(claimantId,participantId,note);
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  expect(db.profileLinkRequest.count).toHaveBeenCalledTimes(1);
  expect(db.profileLinkRequest.create).toHaveBeenCalledTimes(1);
 });
 it('a fourth claim is blocked in the same transaction as its rate-limit count',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.profileLinkRequest.count.mockResolvedValueOnce(3);
  await expect(service.submit(claimantId,participantId,note)).rejects.toBeInstanceOf(ConflictException);
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  expect(db.profileLinkRequest.create).not.toHaveBeenCalled();
 });

});
