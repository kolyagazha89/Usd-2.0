import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {availableCatalogModels,catalogCategoryForEquipment,isApprovedCatalogModel,isUnchangedLegacyCatalogRow,findInvalidEquipmentNameRow,resolveEquipmentCatalogId,findUnapprovedBatteryRow} from '../src/participant/component-catalog-rules.ts';

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

test('member and admin editor accept free text while maintaining technical validation',async()=>{
 const editor=await readFile(new URL('../src/admin/ConfigurationsPage.tsx',import.meta.url),'utf8');
 assert.match(editor,/findInvalidEquipmentNameRow\(v\[key\]\)/);
 assert.match(editor,/findUnapprovedBatteryRow\(catalogs\.batteryTypes,v\.batteries,initial\.batteries\)/);
 assert.match(editor,/activeModels\(picker\.kind,picker\.type\)/);
 assert.match(editor,/modelOptions\('AUDIO_COMPONENT',x\.brand,x\.model,x\.type\)/);
 assert.match(editor,/Number\.isSafeInteger\(Number\(x\.quantity\)\)/);
 assert.match(editor,/resolveEquipmentCatalogId\(catalogModels,kind,row,initialRows\[kind\]\)/);
 assert.doesNotMatch(editor,/Выберите модель с ID из каталога USD/);
 assert.doesNotMatch(editor,/отправьте запрос администратору/);
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


test('free-text equipment needs a brand and model; suggestions are never mandatory',()=>{
 assert.equal(findInvalidEquipmentNameRow([{brand:' Custom ',model:' Model X '}]),null);
 assert.deepEqual(findInvalidEquipmentNameRow([{brand:' ',model:'Model X'}]),{brand:' ',model:'Model X'});
 assert.deepEqual(findInvalidEquipmentNameRow([{brand:'Custom',model:'   '}]),{brand:'Custom',model:'   '});
 assert.deepEqual(findInvalidEquipmentNameRow([{brand:'Custom',model:'X'.repeat(161)}]),{brand:'Custom',model:'X'.repeat(161)});
 assert.equal(findInvalidEquipmentNameRow([]),null);
});

test('only real catalog matches keep IDs; manual edits clear stale IDs, unchanged retired models keep history',()=>{
 const selected={brand:'Deaf Bonce',model:'Apocalypse 15',type:'SUBWOOFER',direction:'SUB',quantity:2};
 assert.equal(resolveEquipmentCatalogId(models,'audioComponents',selected,[]),'sub');
 assert.equal(resolveEquipmentCatalogId(models,'audioComponents',{...selected,brand:'  deaf bonce  ',model:'apocalypse 15'},[]),'sub');
 assert.equal(resolveEquipmentCatalogId(models,'audioComponents',{...selected,model:'Custom 18',catalogEntryId:'sub'},[]),null);
 assert.equal(resolveEquipmentCatalogId(models,'audioComponents',{...selected,type:'MIDBASS',catalogEntryId:'sub'},[]),null);
 const retired={id:'old',catalogEntryId:'retired-id',brand:'Pride',model:'Retired 15',type:'SUBWOOFER',direction:'SUB',quantity:2};
 assert.equal(resolveEquipmentCatalogId(models,'audioComponents',retired,[retired]),'retired-id');
 assert.equal(resolveEquipmentCatalogId(models,'audioComponents',{...retired,quantity:3},[retired]),null);
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
 assert.match(editor,/catalogStatus!=='ready'/);
 assert.match(editor,/setCatalogReload\(n=>n\+1\)/);
 assert.match(editor,/Подсказки справочника временно недоступны/);

 assert.match(editor,/batteries:\(v\.batteries\?\?\[\]\)\.map\(\(battery:any\)=>\(\{\.\.\.battery,quantity:Number\(battery\.quantity\)\}\)\)/);
 assert.match(editor,/generators:\(v\.generators\?\?\[\]\)\.map\(\(generator:any\)=>\(\{\.\.\.generator,quantity:Number\(generator\.quantity\)\}\)\)/);
});

test('equipment picker clearly handles unavailable, loading and empty catalogs',async()=>{
 const [editor,qa]=await Promise.all([
  readFile(new URL('../src/admin/ConfigurationsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../../scripts/candidate-browser-qa.mjs',import.meta.url),'utf8'),
 ]);
 assert.match(editor,/catalogStatus==='loading'.*Загружаем справочник оборудования USD/);
 assert.match(editor,/catalogStatus==='error'.*Не удалось загрузить справочник/);
 assert.match(editor,/setCatalogReload\(n=>n\+1\)\}>Повторить загрузку/);
 assert.match(editor,/catalogStatus==='ready'&&pickerBrands\.length===0/);
 assert.doesNotMatch(editor,/DEFAULT_VIBRATION_BRANDS|\['STP','ComfortMat','Audior','Global'\]/,'editable vibration brand choices must not be hardcoded in React');
 assert.match(editor,/vibrationBrands:Array\.isArray\(c\.vibrationBrands\)\?c\.vibrationBrands:\[\]/);
 assert.match(editor,/value=\{picker.brand\} list=/);
 assert.match(editor,/value=\{picker.model\} type="search"/);
 assert.match(editor,/disabled=\{!picker.brand.trim\(\)\|\|!picker.model.trim\(\)\}/);
 assert.match(qa,/batteryTypes:\[\{code:'AGM'/,'the browser fixture must satisfy the required public catalog contract');
 assert.match(qa,/option\[value="Alphard"\]/,'browser QA waits for catalog hydration');
});
