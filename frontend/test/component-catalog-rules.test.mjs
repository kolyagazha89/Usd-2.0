import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {availableCatalogModels,catalogCategoryForEquipment,isApprovedCatalogModel,isUnchangedLegacyCatalogRow,findUnapprovedEquipmentRow,findUnapprovedBatteryRow} from '../src/participant/component-catalog-rules.ts';

const models=[
 {id:'sub',category:'SUBWOOFER',brand:'Deaf Bonce',model:'Apocalypse 15',isActive:true},
 {id:'speaker',category:'AUDIO_COMPONENT',brand:'Deaf Bonce',model:'Machete M60',isActive:true},
 {id:'amp',category:'AMPLIFIER',brand:'Pride',model:'Uno',isActive:true},
 {id:'head',category:'HEAD_UNIT',brand:'Pioneer',model:'MVH-100',isActive:true,lifecycle:'DISCONTINUED'},
 {id:'inactive',category:'SUBWOOFER',brand:'Pride',model:'Unapproved',isActive:false},
];

test('a subwoofer cannot be selected as a front speaker or vice versa',()=>{
 assert.equal(catalogCategoryForEquipment('audioComponents','SUBWOOFER'),'SUBWOOFER');
 assert.equal(catalogCategoryForEquipment('audioComponents','MIDBASS'),'AUDIO_COMPONENT');
 assert.equal(catalogCategoryForEquipment('amplifiers','SUBWOOFER'),'AMPLIFIER');
 assert.deepEqual(availableCatalogModels(models,'audioComponents','SUBWOOFER').map(m=>m.id),['sub']);
 assert.deepEqual(availableCatalogModels(models,'audioComponents','MIDBASS').map(m=>m.id),['speaker']);
 assert.equal(isApprovedCatalogModel(models,'audioComponents',{type:'SUBWOOFER',brand:'Deaf Bonce',model:'Machete M60'}),false);
 assert.equal(isApprovedCatalogModel(models,'audioComponents',{type:'MIDBASS',brand:'Deaf Bonce',model:'Apocalypse 15'}),false);
 assert.equal(isApprovedCatalogModel(models,'audioComponents',{type:'SUBWOOFER',brand:' Deaf Bonce ',model:'apocalypse 15'}),true);
 assert.equal(isApprovedCatalogModel(models,'audioComponents',{type:'SUBWOOFER',brand:'Pride',model:'Unapproved'}),false);
 assert.equal(isApprovedCatalogModel(models,'headUnits',{brand:'Pioneer',model:'MVH-100'}),true,'discontinued models remain selectable');
 assert.equal(isApprovedCatalogModel(models,'amplifiers',{brand:'Pride',model:'Uno'}),true);
 assert.equal(isApprovedCatalogModel(models,'amplifiers',{brand:'Pride',model:'Anything'}),false);
});

test('unchanged imported rows remain editable but cannot be used to bypass catalog validation',()=>{
 const original=[{id:'saved-1',type:'MIDBASS',brand:'Legacy',model:'Old speaker'}];
 assert.equal(isUnchangedLegacyCatalogRow(original,'audioComponents',{...original[0]}),true);
 assert.equal(isUnchangedLegacyCatalogRow(original,'audioComponents',{...original[0],type:'SUBWOOFER'}),false);
 assert.equal(isUnchangedLegacyCatalogRow(original,'audioComponents',{...original[0],model:'Invented model'}),false);
 assert.equal(isUnchangedLegacyCatalogRow(original,'audioComponents',{type:'MIDBASS',brand:'Legacy',model:'Old speaker'}),false,'a newly added duplicate has no saved ID');
 assert.equal(isUnchangedLegacyCatalogRow([], 'audioComponents',original[0]),false);
 assert.equal(isUnchangedLegacyCatalogRow(null,'audioComponents',original[0]),false);
});

test('retired catalog entries remain editable only with an unchanged ID, quantity and direction',()=>{
 const old={id:'saved-1',catalogEntryId:'retired-uuid',type:'SUBWOOFER',direction:'SUB',quantity:2,brand:'Pride',model:'Retired 15'};
 assert.equal(isUnchangedLegacyCatalogRow([old],'audioComponents',{...old}),true);
 assert.equal(isUnchangedLegacyCatalogRow([old],'audioComponents',{...old,catalogEntryId:undefined}),false);
 assert.equal(isUnchangedLegacyCatalogRow([old],'audioComponents',{...old,catalogEntryId:'another-uuid'}),false);
 assert.equal(isUnchangedLegacyCatalogRow([old],'audioComponents',{...old,quantity:3}),false);
 assert.equal(isUnchangedLegacyCatalogRow([old],'audioComponents',{...old,direction:'FRONT'}),false);
});

test('both member and admin editor validate models against the same catalog rules',async()=>{
 const editor=await readFile(new URL('../src/admin/ConfigurationsPage.tsx',import.meta.url),'utf8');
 assert.match(editor,/findUnapprovedEquipmentRow\(catalogs\.componentModels,key,v\[key\],initial\[key\]\)/);
 assert.match(editor,/findUnapprovedBatteryRow\(catalogs\.batteryTypes,v\.batteries,initial\.batteries\)/);
 assert.match(editor,/activeModels\(picker\.kind,picker\.type\)/);
 assert.match(editor,/modelOptions\('AUDIO_COMPONENT',x\.brand,x\.model,x\.type\)/);
 assert.doesNotMatch(editor,/if\(admin\|\|historicalFinal\)return true/);
 assert.match(editor,/Number\.isSafeInteger\(Number\(x\.quantity\)\)/);
 assert.match(editor,/catalogEntryId:entry\?String\(entry\.id\):row\.catalogEntryId/);
});

test('catalog admin preserves stable IDs by deactivating rather than deleting models',async()=>{
 const admin=await readFile(new URL('../src/admin/CatalogPage.tsx',import.meta.url),'utf8');
 assert.match(admin,/const toggleComponentModel=async/);
 assert.match(admin,/const toggleComponentBrand=async/);
 assert.match(admin,/Включить модель/);
 assert.match(admin,/Отключить модель/);
 assert.match(admin,/Включить марку/);
 assert.doesNotMatch(admin,/componentModels:catalogs\.componentModels\.filter\(\(x:any\)=>x\.id!==item\.id\)/);
 assert.doesNotMatch(admin,/Удалить марку и модели\?/);
});


test('editor consumes retired equipment only once and rejects altered historical rows',()=>{
 const old={id:'saved-1',catalogEntryId:'retired-id',type:'SUBWOOFER',direction:'SUB',quantity:2,brand:'Pride',model:'Retired 15'};
 assert.equal(findUnapprovedEquipmentRow(models,'audioComponents',[old],[old]),null);
 assert.deepEqual(findUnapprovedEquipmentRow(models,'audioComponents',[old,{...old}],[old]),old);
 assert.deepEqual(findUnapprovedEquipmentRow(models,'audioComponents',[{...old,quantity:3}],[old]),{...old,quantity:3});
 assert.deepEqual(findUnapprovedEquipmentRow(models,'audioComponents',[{...old,type:'MIDBASS'}],[old]),{...old,type:'MIDBASS'});
 assert.deepEqual(findUnapprovedEquipmentRow(models,'audioComponents',[{...old,catalogEntryId:''}],[old]),{...old,catalogEntryId:''});
 assert.equal(findUnapprovedEquipmentRow(models,'audioComponents',[
  {type:'SUBWOOFER',brand:'Deaf Bonce',model:'Apocalypse 15'}
 ],[]),null,'a published model is resolved to its stable ID before the API call');
 assert.deepEqual(findUnapprovedEquipmentRow([{category:'SUBWOOFER',brand:'Pride',model:'No ID'}],
  'audioComponents',[{type:'SUBWOOFER',brand:'Pride',model:'No ID'}],[]),
  {type:'SUBWOOFER',brand:'Pride',model:'No ID'});
});

test('battery types must be active CMS codes; historical exceptions are bounded',()=>{
 const types=[{code:'LTO',isActive:true},{code:'AGM',isActive:false}];
 const active={brand:'LTO',model:'80',quantity:2};
 const retired={brand:'AGM',model:'100',quantity:1};
 assert.equal(findUnapprovedBatteryRow(types,[active],[]),null);
 assert.deepEqual(findUnapprovedBatteryRow(types,[retired],[]),retired);
 assert.equal(findUnapprovedBatteryRow(types,[retired],[retired]),null);
 assert.deepEqual(findUnapprovedBatteryRow(types,[retired,{...retired}],[retired]),retired);
 assert.deepEqual(findUnapprovedBatteryRow(types,[{...retired,quantity:2}],[retired]),{...retired,quantity:2});
 assert.deepEqual(findUnapprovedBatteryRow(types,[{...retired,brand:'UNKNOWN'}],[retired]),{...retired,brand:'UNKNOWN'});
 assert.deepEqual(findUnapprovedBatteryRow([], [active],[]),active,'a missing catalog cannot silently authorize new battery types');
});

test('configuration editor does not silently add an unknown AGM fallback and serializes all counts',async()=>{
 const editor=await readFile(new URL('../src/admin/ConfigurationsPage.tsx',import.meta.url),'utf8');
 assert.match(editor,/const defaultBatteryCode=batteryTypes\[0\]\?\.code\?\?''/);
 assert.match(editor,/batteries:\(v\.batteries\?\?\[\]\)\.map\(\(battery:any\)=>\(\{\.\.\.battery,quantity:Number\(battery\.quantity\)\}\)\)/);
 assert.match(editor,/generators:\(v\.generators\?\?\[\]\)\.map\(\(generator:any\)=>\(\{\.\.\.generator,quantity:Number\(generator\.quantity\)\}\)\)/);
});
