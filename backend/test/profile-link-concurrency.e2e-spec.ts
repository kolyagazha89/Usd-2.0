import {randomUUID} from 'node:crypto';
import {ConflictException} from '@nestjs/common';
import {PrismaService} from '../src/prisma/prisma.service';
import {AuthService} from '../src/auth/auth.service';
import {ProfileLinksService} from '../src/auth/profile-links.service';
import {ParticipantsService} from '../src/participants/participants.service';
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
 it('rolls a self-claim back when verified email changes after ownership read',async()=>{
  const user=await createUser(),profile=await createHistory(user.email);
  const changedEmail=randomUUID()+'@profile-race.invalid';
  const boundary={
   $transaction:(callback:any)=>db.$transaction(async tx=>callback(new Proxy(tx,{
    get(target,key){
     if(key==='user')return new Proxy(target.user,{
      get(delegate,operation){
       if(operation==='updateMany')return async(args:any)=>{
        // Independent connection commits a real email-confirmation write
        // after the ownership read, before the guarded participant update.
        await db.user.update({where:{id:user.id},data:{email:changedEmail}});
        return delegate.updateMany(args);
       };
       return Reflect.get(delegate,operation);
      },
     });
     return Reflect.get(target,key);
    },
   }))),
  } as unknown as PrismaService;
  const racing=new AuthService(boundary,{} as never,{} as never);
  await expect(racing.linkHistoricalProfile(user.id,profile)).rejects.toBeInstanceOf(ConflictException);
  const current=await db.user.findUniqueOrThrow({where:{id:user.id}});
  expect(current.email).toBe(changedEmail);
  expect(current.participantId).toBeNull();
  expect(await finalAudits([user.id])).toBe(0);
  expect(await db.profileLinkRequest.count({where:{claimantUserId:user.id}})).toBe(0);
 });

});
