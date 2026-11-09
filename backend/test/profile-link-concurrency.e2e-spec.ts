import {randomUUID} from 'node:crypto';
import {ConflictException} from '@nestjs/common';
import {PrismaService} from '../src/prisma/prisma.service';
import {AuthService} from '../src/auth/auth.service';
import {ProfileLinksService} from '../src/auth/profile-links.service';
import {ParticipantsService} from '../src/participants/participants.service';
import {ProfileMergeService} from '../src/auth/profile-merge.service';
import type {AuthenticatedRequest} from '../src/auth/authenticated-request';
const suite=process.env.USD_PROFILE_LINK_RACE_TEST==='1'?describe:describe.skip;
suite('historical profile ownership races on disposable PostgreSQL18',()=>{
 let db:PrismaService,auth:AuthService,links:ProfileLinksService;
 const userIds:string[]=[],participantIds:string[]=[];
 const actor=(sub:string)=>({user:{sub,role:'PARTICIPANT'}} as AuthenticatedRequest);
 const createUser=async(role:'ADMIN'|'PARTICIPANT'='PARTICIPANT')=>{
  const id=randomUUID();userIds.push(id);return db.user.create({data:{id,email:id+'@profile-race.invalid',passwordHash:'synthetic-unused',emailVerifiedAt:new Date(),role}});
 };
 const createHistory=async(email?:string)=>{
  const id=randomUUID();participantIds.push(id);await db.participant.create({data:{id,firstName:'Synthetic',lastName:'Historical',isPublic:true}});
  if(email)await db.participantLegacyEmail.create({data:{participantId:id,email}});return id;
 };
 const finalAudits=(ids:string[])=>db.auditLog.count({where:{userId:{in:ids},action:{in:['PARTICIPANT_PROFILE_LINKED','PROFILE_LINK_APPROVED']}}});
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??'');
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/usd_(?:identity_auth|profile_links)_[a-z0-9_]+$/.test(url.pathname)||url.search||url.hash)throw Error('Disposable loopback identity/profile-links database required');
  db=new PrismaService();await db.$connect();
  const rows=await db.$queryRawUnsafe<Array<{version:string}>>("SELECT current_setting('server_version_num') AS version");
  if(Number(rows[0].version)<180000||Number(rows[0].version)>=190000)throw Error('PostgreSQL18 required');
  if(await db.user.count()||await db.participant.count())throw Error('Refusing nonempty ownership fixture');
  // These methods never invoke JWT signing or mail; use only the real DB boundary.
  auth=new AuthService(db,{} as never,{} as never);links=new ProfileLinksService(db);
 });
 afterAll(async()=>{
  if(!db)return;
  await db.auditLog.deleteMany({where:{userId:{in:userIds}}});
  await db.profileLinkRequest.deleteMany({where:{claimantUserId:{in:userIds}}});
  await db.participantMergeRedirect.deleteMany({where:{sourceId:{in:participantIds}}});
  await db.user.deleteMany({where:{id:{in:userIds}}});
  await db.participantLegacyEmail.deleteMany({where:{participantId:{in:participantIds}}});
  await db.participant.deleteMany({where:{id:{in:participantIds}}});await db.$disconnect();
 });
 it('limits four concurrent requests for different profiles to three in24h',async()=>{
  const user=await createUser();const profiles=await Promise.all(Array.from({length:4},()=>createHistory()));
  const results=await Promise.allSettled(profiles.map(id=>links.submit(user.id,id,'Synthetic ownership evidence for manual review')));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(3);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect(await db.profileLinkRequest.count({where:{claimantUserId:user.id}})).toBe(3);
  const pending=await db.profileLinkRequest.findFirstOrThrow({where:{claimantUserId:user.id}});
  await links.submit(user.id,pending.participantId,'Same request safely retried with synthetic evidence');
  expect(await db.profileLinkRequest.count({where:{claimantUserId:user.id}})).toBe(3);
 });
 it('allows only one concurrent verified-email claim for the same account',async()=>{
  const user=await createUser();const profiles=await Promise.all([createHistory(user.email),createHistory(user.email)]);
  const results=await Promise.allSettled(profiles.map(id=>auth.linkHistoricalProfile(user.id,id)));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect(profiles).toContain((await db.user.findUniqueOrThrow({where:{id:user.id}})).participantId);
  expect(await finalAudits([user.id])).toBe(1);
 });
 it('serializes ADMIN review against verified self-claim for the same historical profile',async()=>{
  const [owner,claimant,admin]=await Promise.all([createUser(),createUser(),createUser('ADMIN')]);const profile=await createHistory(owner.email);
  const pending=await links.submit(claimant.id,profile,'Synthetic ownership evidence supplied to administrator');
  const results=await Promise.allSettled([auth.linkHistoricalProfile(owner.id,profile),links.review(pending.id,admin.id,'APPROVE')]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect(await db.user.count({where:{participantId:profile}})).toBe(1);
  expect(await finalAudits([owner.id,admin.id])).toBe(1);
 });
 it('rolls new creation back when self-link commits after its stale account read',async()=>{
  const user=await createUser(),profile=await createHistory(user.email);const before=await db.participant.count();
  // Delay only the creation transaction boundary: the real self-link commits
  // after createMe read user.participantId=null and before it tries to write.
  const delayed={user:db.user,siteSettings:db.siteSettings,participant:db.participant,$transaction:async(callback:any)=>{await auth.linkHistoricalProfile(user.id,profile);return db.$transaction(callback)}} as unknown as PrismaService;
  await expect(new ParticipantsService(delayed).createMe(actor(user.id),{firstName:'Synthetic',lastName:'New'})).rejects.toBeInstanceOf(ConflictException);
  expect((await db.user.findUniqueOrThrow({where:{id:user.id}})).participantId).toBe(profile);
  expect(await db.participant.count()).toBe(before);
  expect(await finalAudits([user.id])).toBe(1);
 });
 it('two concurrent new-profile creations attach one profile with no orphan',async()=>{
  const user=await createUser(),before=await db.participant.count(),service=new ParticipantsService(db);
  const results=await Promise.allSettled([service.createMe(actor(user.id),{firstName:'Synthetic',lastName:'First'}),service.createMe(actor(user.id),{firstName:'Synthetic',lastName:'Second'})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect(await db.participant.count()).toBe(before+1);
  const created=(await db.user.findUniqueOrThrow({where:{id:user.id}})).participantId!;participantIds.push(created);
 });

 it('atomically joins a real registration and record while the old public profile and USD QR still resolve',async()=>{
  const admin=await createUser('ADMIN'),owner=await createUser();
  const sourceId=await createHistory(owner.email),targetId=await createHistory();
  const ids=Object.fromEntries(['season','stage','direction','class','car','config','version','reg','number','regClass','result','record'].map(key=>[key,randomUUID()]));
  const originalToken='a'.repeat(48);
  await db.user.update({where:{id:owner.id},data:{participantId:sourceId}});
  await db.participant.update({where:{id:sourceId},data:{usdIdToken:originalToken}});
  await db.season.create({data:{id:ids.season,name:'Synthetic identity history',year:2099}});
  await db.stage.create({data:{id:ids.stage,seasonId:ids.season,stageNumber:99,name:'Synthetic merged stage',date:new Date('2099-05-06'),status:'COMPLETED',resultsPublishedAt:new Date()}});
  await db.direction.create({data:{id:ids.direction,name:'SPL'}});
  await db.class.create({data:{id:ids.class,directionId:ids.direction,name:'Synthetic merge class',code:'MERGE-'+ids.class}});
  await db.car.create({data:{id:ids.car,participantId:sourceId,brand:'Synthetic',model:'Test',registrationNumber:'A123AA72'}});
  await db.carConfiguration.create({data:{id:ids.config,carId:ids.car,name:'Synthetic audio'}});
  await db.carConfigurationVersion.create({data:{id:ids.version,configurationId:ids.config,version:1}});
  await db.registration.create({data:{id:ids.reg,participantId:sourceId,carId:ids.car,stageId:ids.stage,configurationVersionId:ids.version,configurationSnapshot:{original:true},participantNumber:1,source:'PRE_REGISTRATION'}});
  await db.registrationNumber.create({data:{id:ids.number,registrationId:ids.reg,stageId:ids.stage,number:1,isPrimary:true}});
  await db.registrationClass.create({data:{id:ids.regClass,registrationId:ids.reg,classId:ids.class,numberId:ids.number}});
  await db.result.create({data:{id:ids.result,registrationId:ids.reg,registrationClassId:ids.regClass,value:161.7,unit:'DB',place:1}});
  await db.record.create({data:{id:ids.record,classId:ids.class,stageId:ids.stage,seasonId:ids.season,participantId:sourceId,carId:ids.car,resultId:ids.result,value:161.7,unit:'DB',achievedAt:new Date('2099-05-06')}});
  try{
   const service=new ProfileMergeService(db);
   const moved=await service.merge(sourceId,targetId,admin.id,sourceId.slice(0,8));
   expect(moved).toMatchObject({success:true,alreadyMerged:false,moved:{cars:1,registrations:1,records:1}});
   const [registration,record,oldParticipant,alias,member]=await Promise.all([
    db.registration.findUniqueOrThrow({where:{id:ids.reg}}),
    db.record.findUniqueOrThrow({where:{id:ids.record}}),
    db.participant.findUniqueOrThrow({where:{id:sourceId}}),
    db.participantMergeRedirect.findUniqueOrThrow({where:{sourceId}}),
    db.user.findUniqueOrThrow({where:{id:owner.id}}),
   ]);
   expect(registration.participantId).toBe(targetId);
   expect(registration.configurationSnapshot).toEqual({original:true});
   expect(record.participantId).toBe(targetId);
   expect(member.participantId).toBe(targetId);
   expect(oldParticipant.id).toBe(sourceId);
   expect(oldParticipant.usdIdToken).toBe(originalToken);
   expect(alias.targetId).toBe(targetId);
   const publicService=new ParticipantsService(db);
   expect((await publicService.findOne(sourceId)).id).toBe(targetId);
   expect((await publicService.findPublicByUsdId(originalToken)).id).toBe(targetId);
   expect(await service.merge(sourceId,targetId,admin.id,sourceId.slice(0,8))).toMatchObject({alreadyMerged:true});
   expect(await db.participantMergeRedirect.count({where:{sourceId}})).toBe(1);
  }finally{
   await db.auditLog.deleteMany({where:{entity:'ParticipantMergeRedirect',entityId:sourceId}});
   await db.participantMergeRedirect.deleteMany({where:{sourceId}});
   await db.record.deleteMany({where:{id:ids.record}});
   await db.registration.deleteMany({where:{id:ids.reg}});
   await db.car.deleteMany({where:{id:ids.car}});
   await db.stage.deleteMany({where:{id:ids.stage}});
   await db.class.deleteMany({where:{id:ids.class}});
   await db.direction.deleteMany({where:{id:ids.direction}});
   await db.season.deleteMany({where:{id:ids.season}});
  }
 });
 it('rolls back moved cars if a later database write throws, without creating an alias or audit',async()=>{
  const admin=await createUser('ADMIN'),sourceId=await createHistory(),targetId=await createHistory(),carId=randomUUID();
  await db.car.create({data:{id:carId,participantId:sourceId,brand:'Synthetic',model:'Rollback',registrationNumber:'B123CC72'}});
  const failingDb:any={
   $transaction:(callback:any,options:any)=>db.$transaction(async(tx:any)=>{
    const decorated=new Proxy(tx,{get(target,key){
     if(key==='record')return {...target.record,updateMany:async()=>{throw new Error('synthetic-mid-transaction-DB-failure')}};
     return Reflect.get(target,key);
    }});
    return callback(decorated);
   },options),
  };
  try{
   await expect(new ProfileMergeService(failingDb).merge(sourceId,targetId,admin.id,sourceId.slice(0,8)))
    .rejects.toThrow('synthetic-mid-transaction-DB-failure');
   expect((await db.car.findUniqueOrThrow({where:{id:carId}})).participantId).toBe(sourceId);
   expect(await db.participantMergeRedirect.count({where:{sourceId}})).toBe(0);
   expect(await db.auditLog.count({where:{entity:'ParticipantMergeRedirect',entityId:sourceId}})).toBe(0);
  }finally{await db.car.delete({where:{id:carId}});}
 });
});
