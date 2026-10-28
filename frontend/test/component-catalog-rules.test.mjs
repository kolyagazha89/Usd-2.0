import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {availableCatalogModels,catalogCategoryForEquipment,isApprovedCatalogModel,isUnchangedLegacyCatalogRow} from '../src/participant/component-catalog-rules.ts';

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

test('both member and admin editor validate models against the same catalog rules',async()=>{
 const editor=await readFile(new URL('../src/admin/ConfigurationsPage.tsx',import.meta.url),'utf8');
 assert.match(editor,/isApprovedCatalogModel\(catalogs\.componentModels,key,row\)/);
 assert.match(editor,/isUnchangedLegacyCatalogRow\(initial\[key\],key,row\)/);
 assert.match(editor,/activeModels\(picker\.kind,picker\.type\)/);
 assert.match(editor,/modelOptions\('AUDIO_COMPONENT',x\.brand,x\.model,x\.type\)/);
 assert.doesNotMatch(editor,/if\(admin\|\|historicalFinal\)return true/);
 assert.match(editor,/Number\.isSafeInteger\(Number\(x\.quantity\)\)/);
});
