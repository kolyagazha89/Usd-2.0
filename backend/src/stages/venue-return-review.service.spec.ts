import {
 BadRequestException,ConflictException,ForbiddenException,
} from '@nestjs/common';
import {VenueReturnReviewService} from './venue-return-review.service';

const reviewer='8b596264-15dd-46d8-92aa-c4e1c50c0207';
const reviewId='8b596264-15dd-46d8-92aa-c4e1c50c0208';
const source='e510f672-79f7-44eb-8173-2a8ff94b1c0e';
const target='8b596264-15dd-46d8-92aa-c4e1c50c0205';
const caseKey='Participant:'+source;
const admins={user:{role:'ADMIN',sub:reviewer}} as any;
const conflict={key:caseKey,table:'Participant',sourceId:source,
 source:{id:source,name:'Анна Тестовая'},
 candidates:[{id:target,name:'Анна Тестовая',city:'Омск'}]};
const original={id:reviewId,status:'PENDING',version:0,
 stageId:'c510f672-79f7-44eb-8173-2a8ff94b1c0e',
 journalEndHash:'b'.repeat(64),journalContentHash:'c'.repeat(64),
 conflicts:[conflict],decisions:null,reviewedByUserId:null};
const decision=(action:string,targetId:string|null,reason='Проверил историю и документы')=>
 ({key:caseKey,action,targetId,reason});
const setup=()=>{
 const row={...original};
 const tx={
  venueReturnReview:{
   findUnique:jest.fn(async()=>({...row})),
   updateMany:jest.fn(async()=>({count:1})),
  },
  auditLog:{create:jest.fn(async()=>({id:'audit'}))},
 };
 const prisma={
  $transaction:jest.fn(async(cb:(arg:typeof tx)=>Promise<unknown>)=>cb(tx)),
  venueReturnReview:{
   findUnique:jest.fn(async()=>({...row})),
   updateMany:jest.fn(async()=>({count:1})),
   create:jest.fn(async()=>({...row})),
   count:jest.fn(async()=>1),
   findMany:jest.fn(async()=>[row]),
  },
  participant:{findMany:jest.fn(async()=>[])},
  car:{findMany:jest.fn(async()=>[])},
 };
 return {service:new VenueReturnReviewService(prisma as any),prisma,tx,row};
};
describe('ADMIN offline return conflict review',()=>{
 const previous=process.env.USD_VENUE_LAN_MODE;
 afterEach(()=>{
  if(previous===undefined)delete process.env.USD_VENUE_LAN_MODE;
  else process.env.USD_VENUE_LAN_MODE=previous;
 });
 it('forbids participants, judges and any review on the local laptop',async()=>{
  const {service}=setup();
  await expect(service.list({user:{role:'PARTICIPANT',sub:reviewer}} as any))
   .rejects.toThrow(ForbiddenException);
  process.env.USD_VENUE_LAN_MODE='true';
  await expect(service.one(reviewId,admins)).rejects.toThrow(ForbiddenException);
 });
 it('LINK stores the exact central candidate, operator, audit and CAS version together',async()=>{
  const {service,tx,prisma}=setup();
  const result=await service.decide(reviewId,{version:0,decisions:[decision('LINK',target)]} as any,admins);
  expect(result).toMatchObject({status:'APPROVED',version:1});
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.venueReturnReview.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({version:0}),
   data:expect.objectContaining({status:'APPROVED',reviewedByUserId:reviewer}),
  }));
  expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({
   userId:reviewer,action:'VENUE_RETURN_REVIEW_DECIDED',
   metadata:expect.objectContaining({targetId:target,action:'LINK',version:1}),
  })});
 });
 it('NEW requires an explanation and creates no silent central identity link',async()=>{
  const {service,tx}=setup();
  await expect(service.decide(reviewId,{version:0,
   decisions:[decision('NEW',null,'нет')]} as any,admins)).rejects.toThrow(BadRequestException);
  expect(tx.venueReturnReview.updateMany).not.toHaveBeenCalled();
  const result=await service.decide(reviewId,{version:0,
   decisions:[decision('NEW',null,'Два разных человека, проверены документы')]} as any,admins);
  expect(result).toMatchObject({status:'APPROVED'});
  expect(result.decisions[0].targetId).toBeNull();
 });
 it('DEFER remains blocked until a later explicit decision; no data changes',async()=>{
  const {service,tx}=setup();
  const result=await service.decide(reviewId,{version:0,
   decisions:[decision('DEFER',null,'')]} as any,admins);
  expect(result.status).toBe('DEFERRED');
  expect(tx.venueReturnReview.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({status:'DEFERRED'}),
  }));
 });
 it('refuses tampered candidate IDs, concurrent version, applied cases, and unexpected request keys',async()=>{
  const {service,tx}=setup();
  await expect(service.decide(reviewId,{version:0,
   decisions:[decision('LINK',source)]} as any,admins)).rejects.toThrow(BadRequestException);
  await expect(service.decide(reviewId,{version:0,
   decisions:[decision('LINK',target)],unknown:'x'} as any,admins)).rejects.toThrow(BadRequestException);
  tx.venueReturnReview.findUnique.mockResolvedValueOnce({...original,version:1} as any);
  await expect(service.decide(reviewId,{version:0,
   decisions:[decision('LINK',target)]} as any,admins)).rejects.toThrow(ConflictException);
  tx.venueReturnReview.findUnique.mockResolvedValueOnce({...original,status:'APPLIED'} as any);
  await expect(service.decide(reviewId,{version:0,
   decisions:[decision('LINK',target)]} as any,admins)).rejects.toThrow(ConflictException);
 });
 it('approved decisions remain bound to a signed content digest and same reviewed case',async()=>{
  const {service,prisma}=setup();
  prisma.venueReturnReview.findUnique.mockResolvedValueOnce({
   ...original,status:'APPROVED',reviewedByUserId:reviewer,
   decisions:[{...decision('LINK',target),table:'Participant',sourceId:source,
    candidateIds:[target]}],
  } as any);
  const approved=await service.matched(reviewer,original.journalEndHash,original.journalContentHash);
  expect(approved.reviewId).toBe(reviewId);
  expect(approved.resolutions[caseKey].targetId).toBe(target);
  await expect(service.matched(reviewer,original.journalEndHash,'f'.repeat(64)))
   .rejects.toThrow(ConflictException);
 });
});
