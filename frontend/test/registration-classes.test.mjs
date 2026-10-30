import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MAX_REGISTRATION_CLASSES,nextRegistrationClassIds,canContinueVehicleRegistration} from '../src/participant/registration-classes.ts';

test('participant can select more than five classes while preserving primary class order',()=>{
 assert.equal(MAX_REGISTRATION_CLASSES,32);
 const selected=['a','b','c','d','e','f'];
 assert.deepEqual(nextRegistrationClassIds(selected,'g',true),[...selected,'g']);
 assert.deepEqual(nextRegistrationClassIds(selected,'c',true),selected);
 assert.deepEqual(nextRegistrationClassIds(selected,'a',false),['b','c','d','e','f']);
 assert.deepEqual(nextRegistrationClassIds(['b','c','d','e','f'],'g',true),['b','c','d','e','f','g']);
 assert.deepEqual(selected,['a','b','c','d','e','f'],'selection must be immutable');
});
test('unchecking a class removes it and duplicate clicks do not add it twice',()=>{
 assert.deepEqual(nextRegistrationClassIds(['a','b'],'b',false),['a']);
 assert.deepEqual(nextRegistrationClassIds(['a'],'a',true),['a']);
 assert.deepEqual(nextRegistrationClassIds([],'a',true),['a']);
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
 assert.match(app,/nextRegistrationClassIds\(ids,id,e\.target\.checked\)/);
 assert.match(app,/registerClassIds\.length>=MAX_REGISTRATION_CLASSES/);
 assert.match(app,/repeatVehicle=\{Boolean\(registerCarId/);
 assert.match(flow,/Вы меняли аудиосистему после предыдущего выступления/);
 assert.match(flow,/<section className="entry-configuration-review"/);
 assert.doesNotMatch(flow,/<legend>Вы меняли аудиосистему/);
 assert.match(app,/Выбрано классов: \{registerClassIds.length\}\./);
 assert.doesNotMatch(app,/missing\|\|c\.code\|\|'Класс USD'/);
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
