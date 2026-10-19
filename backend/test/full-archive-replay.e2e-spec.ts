import {PrismaService} from '../src/prisma/prisma.service';
import {NameNormalizerService} from '../src/common/names/name-normalizer.service';
import {ImportsService} from '../src/imports/imports.service';
import {GlobalHistoricalImportService} from '../src/imports/global-historical-import.service';
import {archiveNameKey,type ArchivePlan} from '../src/imports/global-historical-plan';
import {historicalProjectKey} from '../src/common/names/historical-project-labels';
import type {AuthenticatedRequest} from '../src/auth/authenticated-request';

// Opt in explicitly on a NEW, disposable localhost database seeded with classes.
// Never clear or reuse a database containing participant/result data.
const replay=process.env.USD_FULL_ARCHIVE_REPLAY==='1'?describe:describe.skip;
replay('full 1777-row archive on a fresh real PostgreSQL database',()=>{
 let db:PrismaService,imports:ImportsService,service:GlobalHistoricalImportService;
 const names=new NameNormalizerService();let request:AuthenticatedRequest,plan:ArchivePlan,batchId:string;
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??'postgresql://invalid');
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^\/usd_identity_/.test(url.pathname))throw Error('Requires a new isolated usd_identity_* localhost database');
  db=new PrismaService();await db.$connect();
  if(await db.participant.count()||await db.result.count()||await db.importJob.count())throw Error('Database is not empty; refusing to change existing records');
  expect(await db.class.count()).toBeGreaterThanOrEqual(19);
  const admin=await db.user.create({data:{email:'archive-replay@example.invalid',passwordHash:'unused-local-test',role:'ADMIN'}});
  request={user:{sub:admin.id,role:'ADMIN'},ip:'isolated-archive-replay'} as AuthenticatedRequest;
  imports=new ImportsService(db,names);service=new GlobalHistoricalImportService(db,imports,names);
  plan=(service as any).loadPlan();
 },30000);
 afterAll(async()=>{service?.onModuleDestroy();if(db)await db.$disconnect()});
 const finish=async(id:string)=>{
  const until=Date.now()+600000;let lastDone=-1;
  while(Date.now()<until){const status=await service.status(id);if(status.processedStages!==lastDone){console.log('Archive stages',status.processedStages,'/',status.totalStages,'results',status.imported,'review',status.needsReview);lastDone=status.processedStages}if(status.status!=='RUNNING')return status;await new Promise(r=>setTimeout(r,250))}
  throw Error('Archive replay timed out');
 };
 it('imports every source result once, with canonical names, no profile duplicates, and all classes present',async()=>{
  const first=await service.start(request);batchId=first.id;const status=await finish(batchId);
  expect({status:status.status,review:status.needsReview,failed:status.failedStages}).toEqual({status:'COMPLETED',review:0,failed:0});
  expect(status.imported).toBe(1777);expect(status.processedStages).toBe(18);
  expect(await db.result.count()).toBe(1777);
  const people=await db.participant.findMany();
  expect(people).toHaveLength(plan.people.length);
  expect(new Set(people.map(p=>[p.lastName,p.firstName,p.middleName].filter(Boolean).join(' '))).size).toBe(people.length);
  for(const p of people){
   expect(p.phone).toBeNull();
   if(p.historicalAlias){expect(historicalProjectKey(p.historicalAlias)).toBeTruthy();expect(p.firstName).toBe('')}
   else {const full=[p.lastName,p.firstName].join(' ');expect(names.inspect(full).needsReview).toBe(false);expect(names.normalize(full)).toBe(full)}
  }
  const rows=await db.importRow.findMany({where:{type:'RESULT'},select:{status:true,participantId:true,registrationId:true,classId:true,rawData:true,normalizedData:true}});
  expect(rows).toHaveLength(1777);const identities=new Map<string,Set<string>>();
  const results=await db.result.findMany({include:{registrationClass:true}});
  const byRegistrationClass=new Map(results.map(r=>[r.registrationId+':'+r.registrationClass.classId,r]));
  for(const row of rows){
   expect(row.status).toBe('COMMITTED');const raw=row.rawData as any,normalized=row.normalizedData as any;
   expect(raw._archiveOriginalName).toBeTruthy();
   const key=String(raw._archivePersonKey??archiveNameKey(raw['ФИО'],names));
   const ids=identities.get(key)??new Set<string>();ids.add(row.participantId!);identities.set(key,ids);
   const result=byRegistrationClass.get(row.registrationId+':'+row.classId);expect(result).toBeDefined();
   expect(Number(result!.value)).toBe(normalized.result);
   if(normalized.place!==null)expect(result!.place).toBe(normalized.place);
  }
  for(const ids of identities.values())expect(ids.size).toBe(1);
  const wallPlus=await db.result.count({where:{registrationClass:{class:{name:'Wall+'}}}});
  expect(wallPlus).toBe(55);
  console.log('FULL_ARCHIVE_REPLAY',JSON.stringify({source:1777,imported:1777,people:people.length,duplicates:0,review:0,wallPlus}));
 },650000);
 it('restarting the same archive keeps every participant, result and configuration snapshot unchanged',async()=>{
  const people=await db.participant.findMany({orderBy:{id:'asc'}});
  const before=await db.registration.findMany({orderBy:{id:'asc'},select:{id:true,participantId:true,configurationVersionId:true,configurationSnapshot:true}});
  const resultIds=(await db.result.findMany({orderBy:{id:'asc'},select:{id:true}})).map(r=>r.id);
  const again=await service.start(request);expect(again.id).toBe(batchId);expect(again.status).toBe('COMPLETED');
  expect(await db.participant.findMany({orderBy:{id:'asc'}})).toEqual(people);
  expect(await db.registration.findMany({orderBy:{id:'asc'},select:{id:true,participantId:true,configurationVersionId:true,configurationSnapshot:true}})).toEqual(before);
  expect((await db.result.findMany({orderBy:{id:'asc'},select:{id:true}})).map(r=>r.id)).toEqual(resultIds);
 });
 it('concurrent imports of the same new person on different stages create one profile',async()=>{
  const season=await db.season.create({data:{year:4099,name:'Local concurrency test'}});
  const cls=await db.class.findUniqueOrThrow({where:{code:'COFFIN'}});
  const jobs=await Promise.all([1,2].map(async stageNumber=>{
   const stage=await db.stage.create({data:{seasonId:season.id,stageNumber,name:'Concurrency '+stageNumber,date:new Date('4099-01-01')}});
   await db.stageClass.create({data:{stageId:stage.id,classId:cls.id}});
   const preview=await imports.previewStage({stageId:stage.id,historicalResults:true,strictHistoricalNames:true,results:[{'ФИО':'Параллельный Алексей','Класс':'Coffin','Номер':1,'Результат':150}]});
   const row=await db.importRow.findFirstOrThrow({where:{importJobId:preview.importJobId,type:'RESULT'}});
   if(row.status==='READY')await db.importRow.update({where:{id:row.id},data:{status:'WARNING'}});
   await imports.resolveImportRow(preview.importJobId,row.id,{participant:{action:'CREATE',fullName:'Параллельный Алексей'},registration:{action:'CREATE',participantNumber:1},car:{action:'CREATE',brand:'Local',model:'Test',registrationCountry:'RU'},classId:cls.id,value:150});
   return preview.importJobId;
  }));
  await Promise.all(jobs.map(id=>imports.commitImport(id,request)));
  expect(await db.participant.count({where:{lastName:'Параллельный',firstName:'Алексей'}})).toBe(1);
  expect(await db.result.count({where:{registration:{stage:{seasonId:season.id}}}})).toBe(2);
 },120000);
});
