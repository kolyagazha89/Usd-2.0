import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registrationInspectionQrUrl,registrationNumbers} from '../src/participant/registration-pass-utils.ts';

const registration={
 id:'registration-1',stageId:'stage-1',participantNumber:2,status:'ACTIVE',
 numbers:[{id:'num3',number:3},{id:'num2',number:2},{id:'num4',number:4}],
 classes:[
  {id:'main',numberId:'num2',class:{name:'Limited 2.0',direction:{name:'SPL'}}},
  {id:'extra',numberId:'num3',class:{name:'129.9',direction:{name:'BassRace'}}},
  {id:'extra2',numberId:'num4',class:{name:'139.9',direction:{name:'BassRace'}}},
 ],
};
test('QR uses existing judge inspection URL and never grants API write capabilities',()=>{
 assert.equal(registrationInspectionQrUrl('https://app.usd-russia.ru',registration),'https://app.usd-russia.ru/admin/inspections?stageId=stage-1&registrationId=registration-1');
 assert.equal(registrationInspectionQrUrl('https://app.usd-russia.ru',{...registration,stageId:'stage & 2'}),'https://app.usd-russia.ru/admin/inspections?stageId=stage%20%26%202&registrationId=registration-1');
});
test('registration pass includes primary and every additional BassRace number, de-duplicated',()=>{
 assert.deepEqual(registrationNumbers(registration),[2,3,4]);
 assert.deepEqual(registrationNumbers({id:'new',status:'ACTIVE',participantNumber:5}),[5]);
});
test('success confirmation is only entered after a saved registration response',async()=>{
 const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
 const pass=await readFile(new URL('../src/participant/RegistrationSuccess.tsx',import.meta.url),'utf8');
  assert.match(app,/const saved:\\{id:string\\}=await apiPost\\('\/registrations\/me'/);
 assert.match(app,/if\(!saved\?\.id\)throw new Error/);
 assert.match(app,/go\('\/participant\/registration-success\?registrationId='/);
 assert.match(app,/if\(routePath==='\/participant\/registration-success'\)/);
 assert.match(app,/registration.status==='CANCELLED'/);
 assert.match(pass,/apiGet<\{token:string\}>\('\/participants\/me\/usd-id'\)/);
 assert.match(pass,/navigator\.clipboard\.writeText\(usdId\)/);
 assert.match(pass,/new XMLSerializer\(\)\.serializeToString\(svg\)/);
 assert.match(pass,/Сохраните пропуск/);
 assert.match(pass,/Перейти к моим регистрациям/);
});
test('do not send a second registration confirmation email; retain other notifications',async()=>{
 const backend=await readFile(new URL('../../backend/src/registrations/registrations.service.ts',import.meta.url),'utf8');
 assert.doesNotMatch(backend,/emailNotifications\?\.registrationConfirmed\(/);
 assert.match(backend,/emailNotifications/);
});
