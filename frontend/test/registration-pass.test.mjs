import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('registration success redirects only after server returns the saved registration identity',async()=>{
 const app=await read('../src/App.tsx');
 assert.match(app,/const created=await apiPost<\{id:string\}>\('\/registrations\/me'/);
 assert.match(app,/if\(!created\?\.id\)throw new Error/);
 assert.match(app,/go\('\/participant\/registration-success\?registrationId='\+encodeURIComponent\(created\.id\)\)/);
 assert.match(app,/if\(path\.startsWith\('\/participant\/registration-success'\)\)/);
 assert.match(app,/<RegistrationPass registrationId=\{registrationId\} go=\{go\}\/>/);
 assert.match(app,/Мой QR-пропуск/);
 assert.match(app,/const rows=listData<any>\(await apiGet<any>\('\/registrations\/me'\)\)/);
 assert.match(app,/item\.status==='ACTIVE'&&item\.stageId===registerStage\?\.id&&item\.carId===registerCarId/);
 assert.match(app,/if\(existing\?\.id\)/);

});

test('QR pass reads persisted registration and participant USD ID, and uses established inspection QR destination',async()=>{
 const pass=await read('../src/participant/RegistrationPass.tsx');
 assert.match(pass,/apiGet<Registration>\('\/registrations\/'\+encodeURIComponent\(registrationId\)\)/);
 assert.match(pass,/apiGet<UsdId>\('\/participants\/me\/usd-id'\)/);
 assert.match(pass,/origin\+'\/admin\/inspections\?stageId='/);
 assert.match(pass,/registrationId='\+encodeURIComponent\(registration\.id\)/);
 assert.match(pass,/registration\.numbers/);
 assert.match(pass,/registration\.classes/);
 assert.match(pass,/registration\.status!=='CANCELLED'/);
 assert.match(pass,/document\.createElement\('a'\)/);
 assert.match(pass,/navigator\.clipboard\.writeText\(usdId\.token\)/);
 assert.match(pass,/особенно при отсутствии интернета/);
});

test('registration notification email is disabled, unlike cancellation and other event notices',async()=>{
 const service=await read('../../backend/src/registrations/registrations.service.ts');
 const notifications=await read('../../backend/src/mail/email-notifications.service.ts');
 assert.doesNotMatch(service,/emailNotifications\?\.registrationConfirmed\(/);
 assert.match(service,/emailNotifications\?\.registrationCancelled/);
 assert.match(notifications,/retireFailedRegistrationConfirmations/);
 assert.match(notifications,/type: 'REGISTRATION_CONFIRMED', status: 'FAILED'/);
 assert.match(notifications,/status: 'SKIPPED', lastError: null/);
 assert.doesNotMatch(notifications,/await this\.registrationConfirmed\(/);
});
