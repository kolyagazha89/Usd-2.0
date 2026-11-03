import { jest } from '@jest/globals';
import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { TeamsService } from './teams.service';

const teamId='team-1',postId='post-1';
const admin={user:{sub:'admin',role:'ADMIN'}} as any;
const commander={user:{sub:'commander',role:'PARTICIPANT'}} as any;
const photo='team-post-post-1-photo';
const reviewedAt='2026-11-03T12:00:00.000Z';
const reviewed={id:postId,teamId,status:'IN_REVIEW',kind:'NEWS',title:'Reviewed original',
 body:'Approved exact content',images:[photo],publishedAt:null,updatedAt:new Date(reviewedAt)};
describe('team moderation uses the reviewed server snapshot',()=>{
 const db:any={
  user:{findUnique:jest.fn()},
  team:{findUnique:jest.fn()},
  teamPost:{findUnique:jest.fn(),findUniqueOrThrow:jest.fn(),updateMany:jest.fn(),update:jest.fn()},
  auditLog:{create:jest.fn()},
  $transaction:jest.fn(),
 };
 let service:TeamsService;
 beforeEach(()=>{
  jest.resetAllMocks();
  db.user.findUnique.mockImplementation(async ({where}:any)=>({
   id:where.id,role:where.id==='admin'?'ADMIN':'PARTICIPANT',
   isActive:true,emailVerifiedAt:new Date(),participantId:'p1',
  }));
  db.team.findUnique.mockResolvedValue({id:teamId,isActive:true,commanderUserId:'commander'});
  db.teamPost.findUnique.mockResolvedValue({...reviewed});
  db.teamPost.findUniqueOrThrow.mockResolvedValue({...reviewed,status:'PUBLISHED'});
  db.teamPost.updateMany.mockResolvedValue({count:1});
  db.auditLog.create.mockResolvedValue({id:'audit-1'});
  db.$transaction.mockImplementation(async (fn:any)=>fn(db));
  service=new TeamsService(db);
 });
 it('publishes only the stored post metadata and never accepts browser text/photos',async()=>{
  await expect(service.approvePost(admin,teamId,postId,reviewedAt)).resolves.toHaveProperty('status','PUBLISHED');
  expect(db.teamPost.updateMany).toHaveBeenCalledTimes(1);
  expect(db.teamPost.updateMany).toHaveBeenCalledWith({
   where:{id:postId,teamId,status:'IN_REVIEW',updatedAt:new Date(reviewedAt)},
   data:{status:'PUBLISHED',publishedAt:expect.any(Date)},
  });
  const update=db.teamPost.updateMany.mock.calls[0][0];
  expect(update.data).not.toHaveProperty('body');
  expect(update.data).not.toHaveProperty('title');
  expect(update.data).not.toHaveProperty('images');
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({action:'TEAM_POST_PUBLISHED',entityId:teamId,
    metadata:{postId,moderation:'STORED_REVIEWED_SNAPSHOT'}}),
  }));
 });
 it('rejects a resubmitted post even if it is IN_REVIEW again',async()=>{
  db.teamPost.findUnique.mockResolvedValueOnce({...reviewed,updatedAt:new Date('2026-11-03T13:00:00.000Z')});
  await expect(service.approvePost(admin,teamId,postId,reviewedAt)).rejects.toBeInstanceOf(ConflictException);
  expect(db.teamPost.updateMany).not.toHaveBeenCalled();
  expect(db.auditLog.create).not.toHaveBeenCalled();
 });
 it('rejects missing or malformed review tokens instead of approving a blind request',async()=>{
  await expect(service.approvePost(admin,teamId,postId,'' as string)).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.returnPostToDraft(admin,teamId,postId,'2026-11-03' as string)).rejects.toBeInstanceOf(BadRequestException);
  expect(db.teamPost.updateMany).not.toHaveBeenCalled();
 });
 it('rejects commander approval even with a forged ADMIN JWT role',async()=>{
  await expect(service.approvePost(commander,teamId,postId,reviewedAt)).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.teamPost.updateMany).not.toHaveBeenCalled();
  expect(db.auditLog.create).not.toHaveBeenCalled();
 });
 it('rejects approval for a foreign team or missing post before mutation',async()=>{
  db.teamPost.findUnique.mockResolvedValueOnce({...reviewed,teamId:'another'});
  await expect(service.approvePost(admin,teamId,postId,reviewedAt)).rejects.toBeInstanceOf(NotFoundException);
  expect(db.teamPost.updateMany).not.toHaveBeenCalled();
 });
 it('fails closed if a commander withdrew review before admin clicked',async()=>{
  db.teamPost.findUnique.mockResolvedValueOnce({...reviewed,status:'DRAFT'});
  await expect(service.approvePost(admin,teamId,postId,reviewedAt)).rejects.toBeInstanceOf(ConflictException);
  db.teamPost.updateMany.mockResolvedValueOnce({count:0});
  await expect(service.approvePost(admin,teamId,postId,reviewedAt)).rejects.toBeInstanceOf(ConflictException);
  expect(db.auditLog.create).not.toHaveBeenCalled();
 });
 it('rejects and preserves reviewed content/photos without client-provided copies',async()=>{
  await service.returnPostToDraft(admin,teamId,postId,reviewedAt);
  expect(db.teamPost.updateMany).toHaveBeenCalledWith({
   where:{id:postId,teamId,status:'IN_REVIEW',updatedAt:new Date(reviewedAt)},
   data:{status:'DRAFT',publishedAt:null},
  });
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({action:'TEAM_POST_RETURNED_FOR_REVISION',metadata:{postId}}),
  }));
 });
 it('does not allow commanders to reject a post through admin review endpoint',async()=>{
  await expect(service.returnPostToDraft(commander,teamId,postId,reviewedAt)).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.teamPost.updateMany).not.toHaveBeenCalled();
 });
 it('forbids the legacy full-body PATCH from publishing stale content',async()=>{
  await expect(service.savePost(admin,teamId,{
   kind:'NEWS',title:'stale',body:'overwrites reviewed',status:'PUBLISHED',images:[],
  },postId)).rejects.toBeInstanceOf(BadRequestException);
  expect(db.teamPost.update).not.toHaveBeenCalled();
 });
});
