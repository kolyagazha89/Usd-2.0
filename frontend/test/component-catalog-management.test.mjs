import test from 'node:test';
import assert from 'node:assert/strict';
import {renameComponentBrand,editComponentModel,archiveCatalogBrand,archiveCatalogModel,toggleCatalogBrand,toggleCatalogModel,activationCounts,enableAllCatalogItems} from '../src/admin/component-catalog-management.ts';
const base=()=>({
 componentBrands:[
  {id:'b1',category:'AMPLIFIER',name:'Kicx',isActive:false},
  {id:'b2',category:'AMPLIFIER',name:'Aura',isActive:true},
  {id:'b3',category:'SUBWOOFER',name:'Kicx',isActive:false},
 ],
 componentModels:[
  {id:'m1',category:'AMPLIFIER',brand:'Kicx',model:'Uno',isActive:false,lifecycle:'DISCONTINUED'},
  {id:'m2',category:'AMPLIFIER',brand:'Kicx',model:'Two',isActive:false},
  {id:'m3',category:'SUBWOOFER',brand:'Kicx',model:'Uno',isActive:false},
 ],
 batteryTypes:[{code:'LTO',name:'Lithium',isActive:true}],
});
test('brand edit cascades to its own models without changing stable ids or a different category',()=>{
 const source=base(),updated=renameComponentBrand(source,'b1','  KICX  Premium  ');
 assert.equal(updated.componentBrands[0].name,'KICX Premium');
 assert.equal(updated.componentModels[0].brand,'KICX Premium');
 assert.equal(updated.componentModels[2].brand,'Kicx');
 assert.equal(updated.componentModels[0].id,'m1');
 assert.equal(source.componentBrands[0].name,'Kicx');
 assert.throws(()=>renameComponentBrand(source,'b1',' AURA '),/уже существует/);
 assert.throws(()=>renameComponentBrand(source,'b1','   '),/корректное/);
});
test('model editor validates brand, duplicate and canonical case without corrupting other categories',()=>{
 const data=base();
 assert.throws(()=>editComponentModel(data,'m1','Two','Kicx'),/уже существует/);
 assert.throws(()=>editComponentModel(data,'m1','Uno','Nonexistent'),/Выберите/);
 const changed=editComponentModel(data,'m1','  Uno X  ','aura');
 assert.equal(changed.componentModels[0].model,'Uno X');
 assert.equal(changed.componentModels[0].brand,'Aura');
 assert.equal(changed.componentModels[0].id,'m1');
 assert.equal(changed.componentModels[2].brand,'Kicx');
});
test('deleting archives model and brand but never removes a historical identity',()=>{
 const initial=base();
 const model=archiveCatalogModel(initial,'m2');
 assert.equal(model.componentModels.length,3);
 assert.deepEqual(model.componentModels[1],{...initial.componentModels[1],isActive:false,isArchived:true});
 const parent=archiveCatalogBrand(initial,'b1');
 assert.equal(parent.componentBrands.length,3);
 assert.equal(parent.componentBrands[0].isArchived,true);
 assert.equal(parent.componentModels[0].isActive,false);
 assert.equal(parent.componentModels[2].isArchived,undefined);
 const restored=toggleCatalogBrand(parent,'b1');
 assert.equal(restored.componentBrands[0].isArchived,false);
 assert.equal(restored.componentModels[0].isActive,false,'restore does not reactivate old models');
});
test('enable-all is idempotent, category scoped, skips archive and reactivates models as well as brands',()=>{
 const data=archiveCatalogModel(base(),'m2');
 assert.deepEqual(activationCounts(data,'AMPLIFIER'),{brands:1,models:1,total:2});
 const category=enableAllCatalogItems(data,'AMPLIFIER');
 assert.equal(category.componentBrands[0].isActive,true);
 assert.equal(category.componentModels[0].isActive,true);
 assert.equal(category.componentModels[1].isActive,false);
 assert.equal(category.componentModels[2].isActive,false);
 assert.deepEqual(activationCounts(category,'AMPLIFIER'),{brands:0,models:0,total:0});
 const global=enableAllCatalogItems(category,'ALL');
 assert.equal(global.componentModels[2].isActive,true);
 assert.equal(global.componentModels[1].isArchived,true);
 assert.deepEqual(enableAllCatalogItems(global,'ALL'),global);
 assert.deepEqual(data.batteryTypes,global.batteryTypes);
});
test('inactive or archived parent cannot be bypassed by enabling child alone',()=>{
 const data=base();
 assert.throws(()=>toggleCatalogModel(data,'m1'),/Сначала включите марку/);
 const updated=toggleCatalogModel(toggleCatalogBrand(data,'b1'),'m1');
 assert.equal(updated.componentModels[0].isActive,true);
 assert.equal(updated.componentModels[1].isActive,false);
});
