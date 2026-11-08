import {randomUUID,createHash} from 'node:crypto';
import {PrismaService} from '../src/prisma/prisma.service';
import {AuthService} from '../src/auth/auth.service';
const suite=process.env.USD_VERIFICATION_RESEND_TEST==='1'?describe:describe.skip;
suite('verification resend on disposable PostgreSQL18',()=>{
 let db:PrismaService;
 const ids:string[]=[];
 const createUser=async()=>{const id=randomUUID();ids.push(id);return db.user.create({data:{id,email:id+'@resend.invalid',passwordHash:'synthetic-unused'}})};
 const attempts=(id:string)=>db.auditLog.count({where:{userId:id,action:'EMAIL_VERIFICATION_RESEND_REQUESTED'}});
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??'');
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/usd_identity_auth_[a-z0-9_]+$/.test(url.pathname)||url.search||url.hash)throw Error('Disposable loopback auth database required');
  db=new PrismaService();await db.$connect();
  const rows=await db.$queryRawUnsafe<Array<{version:string}>>("SELECT current_setting('server_version_num') AS version");
  if(Number(rows[0].version)<180000||Number(rows[0].version)>=190000)throw Error('PostgreSQL18 required');
  if(await db.user.count())throw Error('Refusing nonempty verification fixture');
 });
 afterAll(async()=>{if(!db)return;await db.auditLog.deleteMany({where:{userId:{in:ids}}});await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect()});
 it('does not orphan a new account when its initial verification token conflicts in PostgreSQL',async()=>{
  const existing=await createUser();
  const raw='synthetic-token-collision';
  const tokenHash=createHash('sha256').update(raw).digest('hex');
  await db.emailVerificationToken.create({data:{userId:existing.id,tokenHash,expiresAt:new Date(Date.now()+86_400_000)}});
  const email=randomUUID()+'@resend.invalid';
  let sent=0;
  const auth=new AuthService(db,{} as any,{sendVerificationEmail:async()=>{sent++}} as any);
  // Isolate the DB atomicity property from unrelated legal-settings seed setup.
  (auth as any).getApprovedLegalVersion=async()=> 'synthetic';
  (auth as any).generateToken=()=>raw;
  try{
   await expect(auth.register(email,'synthetic-secure-password',true,true,false)).rejects.toThrow();
   expect(await db.user.findUnique({where:{email}})).toBeNull();
   expect(sent).toBe(0);
   expect(await db.emailVerificationToken.count({where:{tokenHash}})).toBe(1);
  }finally{
   await db.user.deleteMany({where:{email}});
  }
 });
 it('twenty concurrent requests reserve and send one message',async()=>{
  const user=await createUser();let sends=0;
  const mail={sendVerificationEmail:async()=>{expect(await attempts(user.id)).toBe(1);sends++}};
  const auth=new AuthService(db,{} as any,mail as any);
  await Promise.all(Array.from({length:20},()=>auth.resendVerificationEmail(user.email)));
  expect(sends).toBe(1);expect(await attempts(user.id)).toBe(1);
  expect(await db.emailVerificationToken.count({where:{userId:user.id}})).toBe(1);
 });
 it('serializes the fifth reservation and preserves quota after restart',async()=>{
  const user=await createUser();let sends=0;
  for(let i=0;i<4;i++)await db.auditLog.create({data:{userId:user.id,entity:'User',entityId:user.id,action:'EMAIL_VERIFICATION_RESEND_REQUESTED',createdAt:new Date(Date.now()-120_000)}});
  const mail={sendVerificationEmail:async()=>{sends++}};
  await Promise.all(Array.from({length:8},()=>new AuthService(db,{} as any,mail as any).resendVerificationEmail(user.email)));
  await db.user.update({where:{id:user.id},data:{lastVerificationResendAt:new Date(Date.now()-61_000)}});
  await new AuthService(db,{} as any,mail as any).resendVerificationEmail(user.email);
  expect(sends).toBe(1);expect(await attempts(user.id)).toBe(5);
  await db.auditLog.updateMany({where:{userId:user.id},data:{createdAt:new Date(Date.now()-3_600_001)}});
  await db.user.update({where:{id:user.id},data:{lastVerificationResendAt:new Date(Date.now()-61_000)}});
  await new AuthService(db,{} as any,mail as any).resendVerificationEmail(user.email);expect(sends).toBe(2);
 });
 it('retains an older valid token when SMTP fails and still consumes a reservation',async()=>{
  const user=await createUser();const old=await db.emailVerificationToken.create({data:{userId:user.id,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60_000)}});
  const auth=new AuthService(db,{} as any,{sendVerificationEmail:async()=>{throw Error('synthetic network failure')}} as any);
  await auth.resendVerificationEmail(user.email);expect(await db.emailVerificationToken.findUnique({where:{id:old.id}})).not.toBeNull();expect(await attempts(user.id)).toBe(1);
  expect((await db.user.findUniqueOrThrow({where:{id:user.id}})).lastVerificationResendAt).not.toBeNull();
 });
 it('rolls token and cooldown back on audit failure, before contactingSMTP',async()=>{
  const user=await createUser();let sends=0;
  const failing={user:db.user,$transaction:(callback:any)=>db.$transaction(tx=>callback({user:tx.user,emailVerificationToken:tx.emailVerificationToken,auditLog:{count:tx.auditLog.count.bind(tx.auditLog),create:async()=>{throw Error('synthetic audit failure')}}}))} as unknown as PrismaService;
  const auth=new AuthService(failing,{} as any,{sendVerificationEmail:async()=>{sends++}} as any);
  await expect(auth.resendVerificationEmail(user.email)).rejects.toThrow('synthetic audit failure');
  expect(sends).toBe(0);expect(await attempts(user.id)).toBe(0);
  expect(await db.emailVerificationToken.count({where:{userId:user.id}})).toBe(0);
  expect((await db.user.findUniqueOrThrow({where:{id:user.id}})).lastVerificationResendAt).toBeNull();
 });
});
