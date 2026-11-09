import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVehicleDirectoryCsv,modelsForVehicleMake} from '../src/vehicle-directory.ts';
import {emptyVehicleOverrides,resolveVehicleCatalog,availableVehicleDirectory,addVehicleBrand,addVehicleModel,saveVehicleBrand,saveVehicleModel,toggleVehicleBrand,toggleVehicleModel,archiveVehicleBrand,archiveVehicleModel,countDisabledVehicles,enableAllVehicles,planVehicleImport,filterVehicleCatalog} from '../src/admin/vehicle-catalog-management.ts';
const csv='марка,модель\nToyota,Camry\nToyota,Corolla\nВАЗ,2107\n';
const seed=parseVehicleDirectoryCsv(csv);
const resolve=(overrides)=>resolveVehicleCatalog(seed,overrides);
test('bundled seed remains intact; overlay is empty until an administrator edits a record',()=>{
 const overlay=emptyVehicleOverrides(),catalog=resolve(overlay);
 assert.equal(catalog.brands.length,2);
 assert.equal(catalog.models.length,3);
 assert.deepEqual(overlay,{brands:[],models:[]});
 assert.deepEqual(availableVehicleDirectory(seed,overlay).makes,seed.makes);
 assert.deepEqual(modelsForVehicleMake(availableVehicleDirectory(seed,overlay),'toyota'),['Camry','Corolla']);
});
test('renaming make never rewrites model identity, existing car or another brand',()=>{
 const old=emptyVehicleOverrides(),original=resolve(old);
 const toyota=original.brands.find(b=>b.name==='Toyota');
 const saved=saveVehicleBrand(original,old,toyota.id,'  TOYOTA  NEW ');
 const current=resolve(saved);
 assert.equal(current.brands.find(b=>b.id===toyota.id).name,'TOYOTA NEW');
 assert.equal(current.models.filter(m=>m.brandId===toyota.id).length,2);
 assert.equal(saved.brands.length,1,'only the single edited brand is persisted');
 assert.equal(saved.models.length,0);
 assert.equal(modelsForVehicleMake(availableVehicleDirectory(seed,saved),'toyota new').length,2);
 assert.throws(()=>saveVehicleBrand(current,saved,toyota.id,'ВАЗ'),/уже есть/);
});
test('adding and editing models checks parent, duplicate, and retains stable IDs',()=>{
 const old=emptyVehicleOverrides(),original=resolve(old);
 const toyota=original.brands.find(b=>b.name==='Toyota'),vaz=original.brands.find(b=>b.name==='ВАЗ');
 const created=addVehicleModel(original,old,'custom-model','seed-brand:toyota','Supra');
 assert.equal(resolve(created).models.length,4);
 assert.throws(()=>addVehicleModel(original,old,'other',toyota.id,'Camry'),/уже есть/);
 const modified=saveVehicleModel(resolve(created),created,'custom-model','Supra MK4',vaz.id);
 assert.equal(resolve(modified).models.find(m=>m.id==='custom-model').brandId,vaz.id);
 assert.equal(resolve(modified).models.find(m=>m.id==='custom-model').name,'Supra MK4');
});
test('archive actions preserve identity, hide suggestions, and cannot be bulk-restored',()=>{
 let o=emptyVehicleOverrides(),c=resolve(o);
 const toyota=c.brands.find(b=>b.name==='Toyota'),camry=c.models.find(m=>m.name==='Camry');
 o=archiveVehicleModel(c,o,camry.id);c=resolve(o);
 assert.deepEqual(modelsForVehicleMake(availableVehicleDirectory(seed,o),'Toyota'),['Corolla']);
 o=archiveVehicleBrand(c,o,toyota.id);c=resolve(o);
 assert.equal(availableVehicleDirectory(seed,o).makes.includes('Toyota'),false);
 assert.equal(countDisabledVehicles(c,'ALL').total,0,'archived records do not reappear through bulk action');
 o=enableAllVehicles(c,o,'ALL');
 assert.equal(availableVehicleDirectory(seed,o).makes.includes('Toyota'),false);
 o=toggleVehicleBrand(resolve(o),o,toyota.id);
 assert.equal(availableVehicleDirectory(seed,o).makes.includes('Toyota'),true);
 o=toggleVehicleModel(resolve(o),o,camry.id);
 assert.deepEqual(modelsForVehicleMake(availableVehicleDirectory(seed,o),'Toyota'),['Camry','Corolla']);
});
test('scoped and global enable-all are idempotent and preserve unrelated overrides',()=>{
 let o=emptyVehicleOverrides(),c=resolve(o);
 const toyota=c.brands.find(b=>b.name==='Toyota'),vaz=c.brands.find(b=>b.name==='ВАЗ');
 o=toggleVehicleBrand(c,o,toyota.id);c=resolve(o);
 const m=c.models.find(m=>m.name==='2107');
 o=toggleVehicleModel(c,o,m.id);c=resolve(o);
 assert.deepEqual(countDisabledVehicles(c,'ALL'),{brands:1,models:1,total:2});
 o=enableAllVehicles(c,o,toyota.id);c=resolve(o);
 assert.equal(c.brands.find(b=>b.id===toyota.id).isActive,true);
 assert.equal(c.models.find(x=>x.id===m.id).isActive,false);
 o=enableAllVehicles(c,o,'ALL');c=resolve(o);
 assert.equal(c.models.find(x=>x.id===m.id).isActive,true);
 assert.deepEqual(enableAllVehicles(c,o,'ALL'),o);
 assert.equal(c.brands.find(b=>b.id===vaz.id).isActive,true);
});
test('preview/import is additive, deduplicated and avoids storing the entire 4,347-row seed',()=>{
 const imported=parseVehicleDirectoryCsv('марка,модель\nToyota,Camry\nToyota,Supra\nSubaru,Impreza\n');
 let id=0;
 const planned=planVehicleImport(resolve(emptyVehicleOverrides()),emptyVehicleOverrides(),imported,()=> 'new'+(++id));
 assert.deepEqual([planned.addedBrands,planned.addedModels,planned.skipped],[1,2,1]);
 assert.equal(planned.overrides.models.length,2);
 assert.equal(planned.overrides.brands.length,1);
 const repeated=planVehicleImport(resolve(planned.overrides),planned.overrides,imported,()=> 'new'+(++id));
 assert.equal(repeated.addedModels,0);
 assert.deepEqual(repeated.overrides,planned.overrides);
});
test('admin route and public suggestion hook use the same overlay',async()=>{
 const {readFile}=await import('node:fs/promises');
 const routes=await readFile(new URL('../src/admin/AdminRoutes.tsx',import.meta.url),'utf8');
 const nav=await readFile(new URL('../src/admin/AdminShell.tsx',import.meta.url),'utf8');
 const hook=await readFile(new URL('../src/use-vehicle-directory.ts',import.meta.url),'utf8');
 assert.match(routes,/VehicleCatalogPage/);
 assert.match(nav,/\/admin\/vehicle-catalog/);
 assert.match(hook,/availableVehicleDirectory/);
});

test('multi-brand CSV preview never overwrites rows when preview ID generator returns one placeholder',()=>{
 const imported=parseVehicleDirectoryCsv('марка,модель\nLada,Granta\nLada,Vesta\nGeely,Coolray\nGeely,Atlas\n');
 const empty=emptyVehicleOverrides();
 const planned=planVehicleImport(resolve(empty),empty,imported,()=> 'preview-only');
 assert.equal(planned.addedBrands,2);
 assert.equal(planned.addedModels,4);
 assert.equal(planned.overrides.brands.length,2);
 assert.equal(planned.overrides.models.length,4);
 const ids=[...planned.overrides.brands,...planned.overrides.models].map(x=>x.id);
 assert.equal(new Set(ids).size,ids.length);
 const resolved=resolve(planned.overrides);
 assert.equal(resolved.models.filter(x=>x.brandId===planned.overrides.brands[0].id).length,2);
 assert.equal(resolved.models.filter(x=>x.brandId===planned.overrides.brands[1].id).length,2);
});

test('participant car editor uses native keyboard and masks plate input',async()=>{
 const {readFile}=await import('node:fs/promises');
 const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(app,/<RussianPlateKeypad/);
 assert.match(app,/registrationNumber:formatPlateInput/);
 assert.match(app,/inputMode="text"/);
});

test('admin car catalog search finds brands by their model names (no empty make list for Camry)',()=>{
 const c=resolve(emptyVehicleOverrides());
 const filtered=filterVehicleCatalog(c,{search:'  CaMrY  ',status:'ALL'});
 assert.deepEqual(filtered.brands.map(b=>b.name),['Toyota']);
 assert.deepEqual(filtered.models.map(m=>m.name),['Camry']);
});

test('admin car catalog search honors active status, model make, and selected brand',()=>{
 const c=resolve(emptyVehicleOverrides());
 const toyota=c.brands.find(b=>b.name==='Toyota');
 const old=emptyVehicleOverrides();
 const off=toggleVehicleModel(c,old,c.models.find(m=>m.name==='Camry').id);
 const inactive=resolve(off);
 assert.deepEqual(filterVehicleCatalog(inactive,{search:'Camry',status:'ACTIVE'}).models,[]);
 assert.deepEqual(filterVehicleCatalog(inactive,{search:'Camry',status:'INACTIVE'}).models.map(m=>m.name),['Camry']);
 assert.deepEqual(filterVehicleCatalog(c,{search:'Toyota',selectedBrand:toyota.id,status:'ALL'}).models.map(m=>m.name),['Camry','Corolla']);
 assert.deepEqual(filterVehicleCatalog(c,{search:'Camry',selectedBrand:'seed-brand:ваз',status:'ALL'}).models,[]);
});
