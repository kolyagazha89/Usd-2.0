import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { TeamsService } from './teams.service';

const teamId='00000000-0000-4000-8000-000000000111';
const postId='00000000-0000-4000-8000-000000000112';
const photo='team-post-'+postId+'-00000000-0000-4000-8000-000000000113';
const body = {kind:'NEWS' as const,title:'Новая команда',body:'Текст команды',status:'DRAFT' as const};

describe('team posts with moderated RustFS galleries',()=>{
 const db:any={
  user:{findUnique:jest.fn()},
  team:{findUnique:jest.fn()},
  teamPost:{findUnique:jest.fn(),create:jest.fn(),update:jest.fn()},
  mediaUpload:{findMany:jest.fn()},
  auditLog:{create:jest.fn()},
  $transaction:jest.fn(),
 };
 const commander={user:{sub:'commander',role:'PARTICIPANT'}} as any;
 const admin={user:{sub:'admin',role:'ADMIN'}} as any;
 let service:TeamsService;
 beforeEach(()=>{
  jest.clearAllMocks();
  db.user.findUnique.mockImplementation(async ({where}:any)=>({
   id:where.id,role:where.id==='admin'?'ADMIN':'PARTICIPANT',
   isActive:true,emailVerifiedAt:new Date(),participantId:'p1',
  }));
  db.team.findUnique.mockResolvedValue({id:teamId,isActive:true,commanderUserId:'commander'});
  db.teamPost.findUnique.mockResolvedValue({id:postId,teamId,status:'DRAFT',images:[]});
  db.mediaUpload.findMany.mockResolvedValue([{targetId:photo}]);
  db.teamPost.update.mockResolvedValue({id:postId,images:[photo]});
  db.teamPost.create.mockResolvedValue({id:postId,images:[]});
  db.auditLog.create.mockResolvedValue({id:'audit-1'});
  db.$transaction.mockImplementation(async (fn:any)=>fn(db));
  service=new TeamsService(db);
 });

 it('allows creating a text draft with empty gallery, before any files are uploaded',async()=>{
  await expect(service.savePost(commander,teamId,{...body,images:[]})).resolves.toHaveProperty('id',postId);
  expect(db.teamPost.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({images:[],status:'DRAFT'}),
  }));
 });

 it('attaches verified photos only from the same existing team post',async()=>{
  await service.savePost(commander,teamId,{...body,images:[photo]},postId);
  expect(db.mediaUpload.findMany).toHaveBeenCalledWith({
   where:{targetType:'SITE_ASSET',targetId:{in:[photo]},completedAt:{not:null}},
   select:{targetId:true},
  });
  expect(db.teamPost.update).toHaveBeenCalledWith(expect.objectContaining({
   where:{id:postId},data:expect.objectContaining({images:[photo]}),
  }));
 });

 it('rejects unverified uploads, reuse from another post and duplicate gallery slots',async()=>{
  db.mediaUpload.findMany.mockResolvedValue([]);
  await expect(service.savePost(commander,teamId,{...body,images:[photo]},postId))
   .rejects.toBeInstanceOf(BadRequestException);
  await expect(service.savePost(commander,teamId,{...body,images:[photo]},undefined))
   .rejects.toBeInstanceOf(BadRequestException);
  await expect(service.savePost(commander,teamId,{...body,images:[photo,photo]},postId))
   .rejects.toBeInstanceOf(BadRequestException);
  expect(db.teamPost.update).not.toHaveBeenCalled();
 });

 it('freezes commander edits after submission and allows safe withdrawal',async()=>{
  db.teamPost.findUnique.mockResolvedValue({id:postId,teamId,status:'IN_REVIEW',images:[photo]});
  await expect(service.savePost(commander,teamId,{
   ...body,status:'IN_REVIEW',body:'Подменённый текст',images:[],
  },postId)).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.teamPost.update).not.toHaveBeenCalled();
  await service.savePost(commander,teamId,{...body,status:'DRAFT',images:[photo]},postId);
  expect(db.teamPost.update).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({status:'DRAFT',publishedAt:null}),
  }));
 });

 it('blocks a stale administrator approval when a post is withdrawn',async()=>{
  db.teamPost.findUnique.mockResolvedValue({id:postId,teamId,status:'DRAFT',images:[photo]});
  await expect(service.savePost(admin,teamId,{...body,status:'PUBLISHED',images:[photo]},postId))
   .rejects.toBeInstanceOf(ConflictException);
  expect(db.teamPost.update).not.toHaveBeenCalled();
 });

 it('reserves publication for ADMIN even if a commander controls the gallery',async()=>{
  await expect(service.savePost(commander,teamId,{...body,status:'PUBLISHED',images:[photo]},postId))
   .rejects.toBeInstanceOf(ForbiddenException);
  db.teamPost.findUnique.mockResolvedValue({id:postId,teamId,status:'IN_REVIEW',images:[photo]});
  await service.savePost(admin,teamId,{...body,status:'PUBLISHED',images:[photo]},postId);
  expect(db.teamPost.update).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({status:'PUBLISHED',images:[photo]}),
  }));
 });
});
