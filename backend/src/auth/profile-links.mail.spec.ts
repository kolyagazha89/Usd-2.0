import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { ProfileLinksService } from './profile-links.service';

const claimantId='123e4567-e89b-42d3-a456-426614174001';
const participantId='123e4567-e89b-42d3-a456-426614174002';
const requestId='123e4567-e89b-42d3-a456-426614174003';
const reviewerId='123e4567-e89b-42d3-a456-426614174004';

function fixture() {
 let committed=false;
 const db:any={
  user:{
   findUnique:jest.fn(async()=>({id:claimantId,email:'member@example.test',emailVerifiedAt:new Date(),isActive:true,participantId:null})),
   updateMany:jest.fn(async()=>({count:1})),
  },
  participant:{findUnique:jest.fn(async()=>({id:participantId,user:null}))},
  profileLinkRequest:{
   findUnique:jest.fn(async()=>({id:requestId,status:'PENDING',claimantUserId:claimantId,participantId})),
   update:jest.fn(async({data}:any)=>({id:requestId,status:data.status,participantId})),
  },
  auditLog:{create:jest.fn(async()=>({id:requestId}))},
  $executeRaw:jest.fn(async()=>0),
  $transaction:jest.fn(async(callback:any)=>{const response=await callback(db);committed=true;return response}),
 };
 const mail:any={sendProfileLinkDecisionEmail:jest.fn(async()=>{expect(committed).toBe(true)})};
 const service=new ProfileLinksService(db);
 // Inject a fake transport at the service boundary, not an external email provider.
 Object.assign(service,{mail});
 return {db,mail,service};
}

describe('ADMIN profile link decision transactional email',()=>{
 it('sends one approved account email only after linking and audit commit',async()=>{
  const {db,mail,service}=fixture();
  const result=await service.review(requestId,reviewerId,'APPROVE');
  expect(result).toEqual({success:true,id:requestId,status:'APPROVED',participantId});
  expect(db.user.updateMany).toHaveBeenCalledTimes(1);
  expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  expect(mail.sendProfileLinkDecisionEmail).toHaveBeenCalledTimes(1);
  expect(mail.sendProfileLinkDecisionEmail).toHaveBeenCalledWith('member@example.test','APPROVED');
  expect(JSON.stringify(result)).not.toContain('member@example.test');
 });

 it('sends a rejection email without linking a profile',async()=>{
  const {db,mail,service}=fixture();
  const result=await service.review(requestId,reviewerId,'REJECT');
  expect(result.status).toBe('REJECTED');
  expect(db.user.updateMany).not.toHaveBeenCalled();
  expect(mail.sendProfileLinkDecisionEmail).toHaveBeenCalledTimes(1);
  expect(mail.sendProfileLinkDecisionEmail).toHaveBeenCalledWith('member@example.test','REJECTED');
 });

 it('does not send again when a reviewed request is replayed',async()=>{
  const {db,mail,service}=fixture();
  db.profileLinkRequest.findUnique.mockResolvedValue({id:requestId,status:'APPROVED',claimantUserId:claimantId,participantId});
  await expect(service.review(requestId,reviewerId,'APPROVE')).rejects.toBeInstanceOf(ConflictException);
  expect(mail.sendProfileLinkDecisionEmail).not.toHaveBeenCalled();
 });

 it('preserves the committed admin decision if the mail provider fails',async()=>{
  const {db,mail,service}=fixture();
  mail.sendProfileLinkDecisionEmail.mockRejectedValueOnce(new Error('synthetic provider failure'));
  const result=await service.review(requestId,reviewerId,'APPROVE');
  expect(result.status).toBe('APPROVED');
  expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  expect(db.user.updateMany).toHaveBeenCalledTimes(1);
 });

 it('does not email an unverified account after rejecting its stale claim',async()=>{
  const {db,mail,service}=fixture();
  db.user.findUnique.mockResolvedValueOnce({id:claimantId,email:'member@example.test',emailVerifiedAt:null,isActive:true,participantId:null});
  const result=await service.review(requestId,reviewerId,'REJECT');
  expect(result.status).toBe('REJECTED');
  expect(mail.sendProfileLinkDecisionEmail).not.toHaveBeenCalled();
 });
});
