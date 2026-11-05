import {randomUUID} from 'node:crypto';
import {ParticipantsService} from '../src/participants/participants.service';
import {PrismaService} from '../src/prisma/prisma.service';
import type {AuthenticatedRequest} from '../src/auth/authenticated-request';
const suite=process.env.USD_PROFILE_PRIVACY_TEST==='1'?describe:describe.skip;
suite('profile contact visibility on isolated PostgreSQL18',()=>{
 let db:PrismaService,service:ParticipantsService;
 const ids=Object.fromEntries(['participant','owner','admin','judge','role'].map(k=>[k,randomUUID()]));
 const made:string[]=[];
 const contact={email:'profile-'+ids.owner+'@privacy.invalid',phone:'+79990000001'};
 const req=(sub:string,role='PARTICIPANT')=>({user:{sub,role}} as AuthenticatedRequest);
 beforeAll(async()=>{
  const u=new URL(process.env.DATABASE_URL??'');
  if(!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','localhost'].includes(u.hostname)||!/^\/usd_(?:profile_privacy|identity_auth)_[a-z0-9_]+$/.test(u.pathname)||u.search||u.hash)throw Error('Disposable loopback profile/auth database required');
  db=new PrismaService();await db.$connect();
  const v=await db.$queryRawUnsafe<Array<{version:string}>>("SELECT current_setting('server_version_num') AS version");
  if(Number(v[0].version)<180000||Number(v[0].version)>=190000)throw Error('PostgreSQL18 required');
  if(await db.user.count()||await db.participant.count())throw Error('Refusing nonempty privacy fixture');
  await db.participant.create({data:{id:ids.participant,firstName:'Synthetic',lastName:'Privacy',phone:contact.phone,isPublic:true}});
  await db.role.create({data:{id:ids.role,key:'PRIVACY-'+ids.role,name:'Synthetic judge',permissions:{participants:['view','create']}}});
  for(const [id,role,extra]of [[ids.owner,'PARTICIPANT',{participantId:ids.participant,email:contact.email}],[ids.admin,'ADMIN',{}],[ids.judge,'PARTICIPANT',{customRoleId:ids.role}]] as const)await db.user.create({data:{id,role,email:'profile-'+id+'@privacy.invalid',passwordHash:'synthetic-unused',emailVerifiedAt:new Date(),...extra}});
  service=new ParticipantsService(db);
 });
 afterAll(async()=>{if(!db)return;await db.user.deleteMany({where:{id:{in:[ids.owner,ids.admin,ids.judge]}}});await db.role.deleteMany({where:{id:ids.role}});await db.participant.deleteMany({where:{id:{in:[ids.participant,...made]}}});await db.$disconnect()});
 const absent=(x:unknown)=>{const text=JSON.stringify(x);expect(text.includes(contact.email)).toBe(false);expect(text.includes(contact.phone)).toBe(false)};
 it('public detail/list never expose contacts while owner and ADMIN retain access',async()=>{
  absent(await service.findOne(ids.participant));absent(await service.findAll());
  const own=await service.findMe(req(ids.owner));expect(own.participant?.phone).toBe(contact.phone);expect(own.participant?.user?.email).toBe(contact.email);
  const admin=await service.findAllAdmin(req(ids.admin,'ADMIN'));expect(admin[0].phone).toBe(contact.phone);expect(admin[0].user?.email).toBe(contact.email);
  await expect(service.findAllAdmin(req(ids.owner))).rejects.toThrow();
 });
 it('delegated participant-view permission never grants another person contact details',async()=>{
  const list=await service.findAllAdmin(req(ids.judge));absent(list);
  expect(Object.hasOwn(list[0],'phone')).toBe(false);expect(Object.hasOwn(list[0].user??{},'email')).toBe(false);
 });
 it('delegated creation does not return another person contacts in its response',async()=>{
  const created=await service.createParticipant(req(ids.judge),{firstName:'Synthetic',lastName:'Created',phone:contact.phone});made.push(created.id);
  expect(Object.hasOwn(created,'phone')).toBe(false);
  expect((await db.participant.findUniqueOrThrow({where:{id:created.id}})).phone).toBe(contact.phone);
 });
});
