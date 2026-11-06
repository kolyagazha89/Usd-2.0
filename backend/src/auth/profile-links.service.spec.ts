import {jest} from '@jest/globals';
import {BadRequestException,ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {ProfileLinksService} from './profile-links.service';

const uuid=(last:string)=>'123e4567-e89b-42d3-a456-'+last;
const claimantId=uuid('426614174001');
const participantId=uuid('426614174002');
const requestId=uuid('426614174003');
const reviewerId=uuid('426614174004');
const note='Участвовал на этапе 2025, автомобиль Lada.';
const reviewReason='Сверены записи участника и доказательства владельца.';

describe('secure manual profile link review',()=>{
 const makeDb=()=>{
  const db:any={
   user:{findUnique:jest.fn(async()=>({id:claimantId,emailVerifiedAt:new Date(),isActive:true,participantId:null})),update:jest.fn(async()=>({id:claimantId}))},
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
 it('allows administrative link only with verified proof and a reason, atomically audited',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.profileLinkRequest.findUnique.mockResolvedValue({id:requestId,status:'PENDING',claimantUserId:claimantId,participantId});
  await expect(service.review(requestId,reviewerId,'APPROVE',reviewReason,false)).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.user.update).not.toHaveBeenCalled();
  const response=await service.review(requestId,reviewerId,'APPROVE',reviewReason,true);
  expect(response.status).toBe('APPROVED');
  expect(db.user.update).toHaveBeenCalledWith({where:{id:claimantId},data:{participantId}});
  // Request, historical participant AND claimant locks prevent competing
  // approvals that target separate participant IDs for the same account.
  expect(db.$executeRaw).toHaveBeenCalledTimes(3);
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({action:'PROFILE_LINK_APPROVED',entity:'ProfileLinkRequest'}),
  }));
 });
 it('refuses conflicts on changed ownership before modifying any profile',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.profileLinkRequest.findUnique.mockResolvedValue({id:requestId,status:'PENDING',claimantUserId:claimantId,participantId});
  db.participant.findUnique.mockResolvedValueOnce({id:participantId,user:{id:'someone-else'}});
  await expect(service.review(requestId,reviewerId,'APPROVE',reviewReason,true)).rejects.toBeInstanceOf(ConflictException);
  expect(db.user.update).not.toHaveBeenCalled();
 });
 it('rejection does not attach a profile',async()=>{
  const db=makeDb(),service=new ProfileLinksService(db);
  db.profileLinkRequest.findUnique.mockResolvedValue({id:requestId,status:'PENDING',claimantUserId:claimantId,participantId});
  await service.review(requestId,reviewerId,'REJECT',reviewReason,false);
  expect(db.user.update).not.toHaveBeenCalled();
  expect(db.profileLinkRequest.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'REJECTED'})}));
 });
});
