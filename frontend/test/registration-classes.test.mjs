import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MAX_REGISTRATION_CLASSES,MAX_PRIMARY_NUMBER_CLASSES,primaryNumberClassCount,isBassRaceStageOption,nextRegistrationClassIds,canContinueVehicleRegistration} from '../src/participant/registration-classes.ts';

const regular=(n)=>({classId:'r'+n,class:{name:'SPL '+n,direction:{name:'SPL'}}});
const bass=(n)=>({classId:'b'+n,class:{name:'BassRace '+n,direction:{name:'BassRace'}}});
const catalog=[...Array.from({length:7},(_,i)=>regular(i)),...Array.from({length:8},(_,i)=>bass(i))];

test('only 5 classes may share primary sticker, all BassRace classes can use extra numbers',()=>{
 assert.equal(MAX_PRIMARY_NUMBER_CLASSES,5);
 assert.ok(MAX_REGISTRATION_CLASSES>5);
 const selected=['r0','r1','r2','r3','r4'];
 assert.deepEqual(nextRegistrationClassIds(selected,'r5',true,catalog),selected);
 assert.deepEqual(nextRegistrationClassIds(selected,'b0',true,catalog),[...selected,'b0']);
 assert.equal(primaryNumberClassCount([...selected,'b0'],catalog),5);
 let multiple=[...selected,'b0'];
 for(let i=1;i<8;i++)multiple=nextRegistrationClassIds(multiple,'b'+i,true,catalog);
 assert.equal(multiple.length,13);
 assert.equal(primaryNumberClassCount(multiple,catalog),5);
 assert.deepEqual(nextRegistrationClassIds(['r0'],'r0',false,catalog),[]);
 assert.deepEqual(selected,['r0','r1','r2','r3','r4'],'selection is immutable');
});
test('one BassRace class shares the primary sticker if fewer than five regular classes',()=>{
 assert.equal(primaryNumberClassCount(['r0','b0','b1'],catalog),2);
 assert.deepEqual(nextRegistrationClassIds(['r0','r1','r2','r3','b0'],'r4',true,catalog),
  ['r0','r1','r2','r3','b0','r4']);
 assert.equal(primaryNumberClassCount(['r0','r1','r2','r3','b0','r4'],catalog),5);
 assert.equal(isBassRaceStageOption(catalog[8]),true);
 assert.equal(isBassRaceStageOption(catalog[0]),false);
 assert.deepEqual(nextRegistrationClassIds([],'missing',true,catalog),[]);
 assert.deepEqual(nextRegistrationClassIds(['b0','b1'],'b1',false,catalog),['b0']);
});
test('legacy imported SPL BassRace names are selectable as an extra number, not a sixth primary class',()=>{
 const rows=[...catalog,{classId:'imported',class:{name:'SPL BassRace 139.9',direction:{name:'SPL'}}}];
 const five=['r0','r1','r2','r3','r4'];
 assert.equal(isBassRaceStageOption(rows.at(-1)),true);
 const chosen=nextRegistrationClassIds(five,'imported',true,rows);
 assert.equal(chosen.length,6);
 assert.equal(primaryNumberClassCount(chosen,rows),5);
});
test('returning competitor must review configuration before moving to classes',()=>{
 assert.equal(canContinueVehicleRegistration(false,false,'',false),false);
 assert.equal(canContinueVehicleRegistration(true,false,'',false),true);
 assert.equal(canContinueVehicleRegistration(true,true,'',false),false);
 assert.equal(canContinueVehicleRegistration(true,true,'unchanged',false),true);
 assert.equal(canContinueVehicleRegistration(true,true,'updated',false),false);
 assert.equal(canContinueVehicleRegistration(true,true,'updated',true),true);
});

test('registration screen wires the class cap and returning-vehicle question',async()=>{
 const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
 const flow=await readFile(new URL('../src/participant/RegistrationFlow.tsx',import.meta.url),'utf8');
 assert.match(app,/nextRegistrationClassIds\(ids,id,e\.target\.checked,stageClasses\)/);
 assert.match(app,/primaryNumberClassCount\(registerClassIds,stageClasses\)/);
 assert.match(app,/repeatVehicle=\{Boolean\(registerCarId/);
 assert.match(flow,/Вы меняли аудиосистему после предыдущего выступления/);
 assert.match(flow,/canContinueVehicleRegistration\(vehicleReady,repeatVehicle,configurationAnswer,updatedReviewed\)/);
 assert.match(flow,/step===0\?canContinueVehicle:classesReady/);
 assert.match(flow,/\[stage\?\.id,carId,configurationId\]/, 'switching stage must reset the registration wizard and review answer');
 assert.match(flow,/setConfigurationAnswer\(''\);setUpdatedReviewed\(false\);setStep\(0\)/,
  'switching car or configuration must return to the vehicle step and require fresh confirmation');
 assert.match(flow,/if\(step>0&&!canContinueVehicle\)setStep\(0\)/,
  'a stale configuration review must not allow staying on class selection or confirmation');
 assert.match(flow,/\[canContinueVehicle,classesReady,step\]/,
  'step guard must react when review eligibility changes');
});

test('inspection and gate frontends use primary-number policy instead of total 5 cap',async()=>{
 const admin=await readFile(new URL('../src/admin/InspectionsPage.tsx',import.meta.url),'utf8');
 assert.match(admin,/nextRegistrationClassIds\(classIds,id,!classIds\.includes\(id\),stageClasses\)/);
 assert.match(admin,/primaryNumberClassCount\(classIds,stageClasses\)/);
 assert.doesNotMatch(admin,/Всего не более 5 классов на регистрацию/);
 assert.doesNotMatch(admin,/if\(classIds\.length>5\)/);
 assert.match(admin,/BassRace.*отдельные номера/);
});
