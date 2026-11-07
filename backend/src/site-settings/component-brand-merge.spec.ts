import {jest} from "@jest/globals";
import {planBrandMerge} from './component-brand-merge';
import {catalogRevision} from './catalog-concurrency';
import {SiteSettingsController} from './site-settings.controller';
import {ROLES_KEY} from '../auth/roles.decorator';
import {SiteSettingsService} from './site-settings.service';

const sample=()=>({componentBrands:[{id:'a',name:'Old',category:'AMP'},{id:'b',name:'New',category:'AMP'},{id:'c',name:'OLD',category:'SUB'}],componentModels:[{id:'m1',category:'AMP',brand:'Old',model:'One',source:'legacy'},{id:'m2',category:'AMP',brand:'New',model:'ONE'},{id:'m3',category:'SUB',brand:'OLD',model:'Two',isActive:false}],extra:1});
describe('brand merge',()=>{
 it('preserves IDs and provenance and archives duplicates in scope',()=>{const c=sample();const p=planBrandMerge(c,{sourceId:'a',targetId:'b',scope:'AMP'});expect(p.collisions).toBe(1);expect(p.catalogs.componentModels[0]).toMatchObject({id:'m1',brand:'New',source:'legacy',isArchived:true,isActive:false,mergedIntoId:'m2'});expect(p.catalogs.componentBrands[0]).toMatchObject({isArchived:true,mergedIntoId:'b'});expect(p.catalogs.componentModels[2]).toEqual(c.componentModels[2]);expect(p.catalogs.extra).toBe(1)});
 it('creates a target in other categories and preserves disabled models',()=>{const p=planBrandMerge(sample(),{sourceId:'a',targetId:'b',scope:'ALL'});expect(p.catalogs.componentBrands.find(x=>x.category==='SUB'&&x.name==='New')).toBeDefined();expect(p.catalogs.componentModels[2]).toMatchObject({id:'m3',brand:'New',isActive:false})});
 it('rejects same, cross-category and archived target',()=>{const c=sample();expect(()=>planBrandMerge(c,{sourceId:'a',targetId:'a',scope:'AMP'})).toThrow();expect(()=>planBrandMerge(c,{sourceId:'a',targetId:'c',scope:'ALL'})).toThrow();c.componentBrands[1]['isArchived']=true;expect(()=>planBrandMerge(c,{sourceId:'a',targetId:'b',scope:'AMP'})).toThrow()});
 it('rejects stale preview before any update or audit',async()=>{const catalogs=sample();const tx:any={$executeRaw:jest.fn(),siteSettings:{findUnique:jest.fn().mockResolvedValue({catalogs}),update:jest.fn()},auditLog:{create:jest.fn()}};const db:any={$transaction:(fn:any)=>fn(tx)};const service=new SiteSettingsService(db);await expect(service.mergeBrands({sourceId:'a',targetId:'b',scope:'AMP',revision:'stale'},'admin')).rejects.toMatchObject({status:409});expect(tx.siteSettings.update).not.toHaveBeenCalled();expect(tx.auditLog.create).not.toHaveBeenCalled();await service.mergeBrands({sourceId:'a',targetId:'b',scope:'AMP',revision:catalogRevision(catalogs)},'admin');expect(tx.siteSettings.update).toHaveBeenCalledTimes(1);expect(tx.auditLog.create).toHaveBeenCalledTimes(1)});
 it('rejects stale catalog replacements and accepts partial catalog patches',async()=>{
  const catalogs=sample();const tx:any={$executeRaw:jest.fn(),siteSettings:{findUnique:jest.fn().mockResolvedValue({catalogs}),upsert:jest.fn(async(args:any)=>({...args.update}))},auditLog:{create:jest.fn()}};const service=new SiteSettingsService({$transaction:(fn:any)=>fn(tx)} as any);
  await expect(service.update({catalogs:{...catalogs,_revision:'stale'}},'admin')).rejects.toMatchObject({status:409});expect(tx.siteSettings.upsert).not.toHaveBeenCalled();expect(tx.auditLog.create).not.toHaveBeenCalled();
  await service.update({catalogs:{recordVisibility:{x:false}}},'admin');expect(tx.siteSettings.upsert.mock.calls[0][0].update.catalogs.componentBrands).toEqual(catalogs.componentBrands);
 });
 it('rejects deleting or rewriting immutable merged aliases through the generic catalog endpoint',async()=>{
  const catalogs=planBrandMerge(sample(),{sourceId:'a',targetId:'b',scope:'AMP'}).catalogs;
  const tx:any={$executeRaw:jest.fn(),siteSettings:{
   findUnique:jest.fn().mockResolvedValue({catalogs}),
   upsert:jest.fn(),
  },auditLog:{create:jest.fn()}};
  const service=new SiteSettingsService({$transaction:(fn:any)=>fn(tx)} as any);
  const renamed=structuredClone(catalogs);
  renamed.componentBrands.find((brand:any)=>brand.id==='a').name='Rewritten alias';
  await expect(service.update({catalogs:{...renamed,_revision:catalogRevision(catalogs)}},'admin')).rejects.toMatchObject({status:409});
  const removed=structuredClone(catalogs);
  removed.componentModels=removed.componentModels.filter((model:any)=>model.id!=='m1');
  await expect(service.update({catalogs:{...removed,_revision:catalogRevision(catalogs)}},'admin')).rejects.toMatchObject({status:409});
  expect(tx.siteSettings.upsert).not.toHaveBeenCalled();
  expect(tx.auditLog.create).not.toHaveBeenCalled();
 });
 it('restricts preview and merge routes to ADMIN',()=>{expect(Reflect.getMetadata(ROLES_KEY,SiteSettingsController.prototype.previewBrandMerge)).toEqual(['ADMIN']);expect(Reflect.getMetadata(ROLES_KEY,SiteSettingsController.prototype.mergeBrands)).toEqual(['ADMIN'])});
 it('serializes concurrent merges and rejects the stale contender',async()=>{
  let catalogs:any=sample(),tail=Promise.resolve();let writes=0;
  const tx:any={$executeRaw:async()=>0,siteSettings:{findUnique:async()=>({catalogs}),update:async({data}:any)=>{catalogs=data.catalogs;writes++}},auditLog:{create:async()=>({})}};
  const db:any={$transaction:(fn:any)=>{const next=tail.then(()=>fn(tx));tail=next.then(()=>{},()=>{});return next}};
  const service=new SiteSettingsService(db),input={sourceId:'a',targetId:'b',scope:'AMP',revision:catalogRevision(catalogs)};
  const results=await Promise.allSettled([service.mergeBrands(input,'admin'),service.mergeBrands(input,'admin')]);
  expect(results.map(x=>x.status)).toEqual(['fulfilled','rejected']);expect(writes).toBe(1);
 });
 it('keeps an archived source model archived and retains the chosen target spelling across categories',()=>{
  const c:any=sample();c.componentBrands.push({id:'d',name:'NEW',category:'SUB',isActive:true});c.componentModels[2].isArchived=true;c.componentModels.push({id:'dest',category:'SUB',brand:'NEW',model:'Other',isActive:true});
  const p=planBrandMerge(c,{sourceId:'a',targetId:'b',scope:'ALL'});expect(p.catalogs.componentModels.find((m:any)=>m.id==='m3')).toMatchObject({brand:'New',isArchived:true,isActive:false});expect(p.catalogs.componentModels.find((m:any)=>m.id==='dest').brand).toBe('New');
 });
 it.each([{isArchived:true,isActive:false},{isActive:false}])('blocks a collision with no selectable target canonical %#',flags=>{
  const c:any=sample();Object.assign(c.componentModels[1],flags);const original=JSON.stringify(c);
  expect(()=>planBrandMerge(c,{sourceId:'a',targetId:'b',scope:'AMP'})).toThrow(/включите|разрешите/i);
  expect(JSON.stringify(c)).toBe(original);expect(c.componentModels.map((m:any)=>m.id)).toEqual(['m1','m2','m3']);
 });
});
