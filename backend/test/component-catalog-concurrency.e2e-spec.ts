import {PrismaService} from '../src/prisma/prisma.service';
import {SiteSettingsService} from '../src/site-settings/site-settings.service';
import {ComponentCatalogRequestsService} from '../src/component-catalog-requests/component-catalog-requests.service';

const integration=process.env.USD_COMPONENTS_INTEGRATION_TEST==='1'?describe:describe.skip;
integration('component catalog concurrency on isolated PostgreSQL 18',()=>{
 let db:PrismaService,settings:SiteSettingsService,requests:ComponentCatalogRequestsService,admin:string,user:string;
 const initial=()=>({componentBrands:[{id:'source',category:'AMPLIFIER',name:'Old',isActive:true},{id:'target',category:'AMPLIFIER',name:'New',isActive:true}],componentModels:[{id:'model',category:'AMPLIFIER',brand:'Old',model:'One',isActive:true}]});
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/usd_components_test')throw Error('Refusing non-local or non-synthetic database');
  db=new PrismaService();await db.$connect();const version=await db.$queryRaw<Array<{server_version:string}>>`SHOW server_version`;if(!version[0].server_version.startsWith('18.'))throw Error('PostgreSQL 18 required');
  const a=await db.user.upsert({where:{email:'admin@component-fixture.invalid'},update:{},create:{email:'admin@component-fixture.invalid',passwordHash:'fixture',role:'ADMIN'}});admin=a.id;
  const u=await db.user.upsert({where:{email:'participant@component-fixture.invalid'},update:{},create:{email:'participant@component-fixture.invalid',passwordHash:'fixture'}});user=u.id;
  settings=new SiteSettingsService(db);requests=new ComponentCatalogRequestsService(db,{sendNotificationEmail:async()=>{}} as any);
 });
 beforeEach(async()=>{await db.auditLog.deleteMany();await db.componentCatalogRequest.deleteMany();await db.siteSettings.deleteMany();await db.siteSettings.create({data:{id:'default',branding:{},homepage:{},stream:{},liveResults:{},navigation:{},contacts:{},social:{},seo:{},legal:{},footer:{},registration:{},catalogs:initial(),partners:[],news:[]}})});
 afterAll(async()=>{if(db)await db.$disconnect()});
 it('serializes merge and stale full-catalog import so neither overwrites the winner',async()=>{
  const snapshot=(await settings.getAdmin()).settings.catalogs as any,revision=snapshot._revision;
  const imported={...snapshot,componentModels:[...snapshot.componentModels,{id:'imported',category:'AMPLIFIER',brand:'New',model:'Two',isActive:true}]};
  const results=await Promise.allSettled([settings.mergeBrands({sourceId:'source',targetId:'target',scope:'AMPLIFIER',revision},admin),settings.update({catalogs:imported},admin)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;expect(rejected.reason.status).toBe(409);
  const catalogs=(await db.siteSettings.findUniqueOrThrow({where:{id:'default'}})).catalogs as any;
  expect(catalogs.componentModels.find((m:any)=>m.id==='model')).toBeDefined();expect(catalogs.componentModels.some((m:any)=>m.id==='imported')||catalogs.componentBrands.find((b:any)=>b.id==='source').isArchived).toBe(true);
 });
 it('preserves request approval and rejects a stale catalog replacement',async()=>{
  const snapshot=(await settings.getAdmin()).settings.catalogs as any;
  const request=await db.componentCatalogRequest.create({data:{userId:user,userEmail:'participant@component-fixture.invalid',category:'AMPLIFIER',brand:'New',model:'Requested'}});
  const [approval,save]=await Promise.allSettled([requests.approve(request.id,admin),settings.update({catalogs:snapshot},admin)]);
  expect(approval.status).toBe('fulfilled');if(save.status==='rejected')expect(save.reason.status).toBe(409);
  await expect(settings.update({catalogs:snapshot},admin)).rejects.toMatchObject({status:409});
  const catalogs=(await db.siteSettings.findUniqueOrThrow({where:{id:'default'}})).catalogs as any;
  expect(catalogs.componentModels.some((m:any)=>m.model==='Requested')).toBe(true);expect((await db.componentCatalogRequest.findUniqueOrThrow({where:{id:request.id}})).status).toBe('APPROVED');
 });
 it('rolls the merge back when its audit insert fails',async()=>{
  const snapshot=(await settings.getAdmin()).settings.catalogs as any;
  await expect(settings.mergeBrands({sourceId:'source',targetId:'target',scope:'AMPLIFIER',revision:snapshot._revision},'missing-admin-id')).rejects.toThrow();
  const row=await db.siteSettings.findUniqueOrThrow({where:{id:'default'}});expect(row.catalogs).toEqual(initial());expect(await db.auditLog.count()).toBe(0);
 });
});
