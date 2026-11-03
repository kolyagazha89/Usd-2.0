import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildOfflineEventPackage,assertOfflinePackage,recordOfflineInspection,markOfflineInspectionSync,resolveOfflineRegistrationQr,findOfflineEntries,OFFLINE_MAX_AGE_MS} from '../src/admin/offline-event-model.ts';
import {sealOfflinePackage,unsealOfflinePackage} from '../src/admin/offline-event-vault.ts';
globalThis.crypto??=webcrypto;

const now=Date.now();
const rows=[
 {id:'reg-active',status:'ACTIVE',participantId:'private-id-123',participantNumber:7,
  participant:{firstName:'Иван',lastName:'Иванов',phone:'+79999999999',email:'ivan@example.com'},
  car:{brand:'Lada',model:'Vesta',registrationNumber:'А001УР001',ownerPhone:'never expose'},
  classes:[{class:{name:'Limited 2.0',direction:{name:'SPL'}}}],
  configurationSnapshot:{secrets:'never expose'},authToken:'ACCESS_TOKEN_SHOULD_NOT_APPEAR'},
 {id:'reg-cancelled',status:'CANCELLED',participantNumber:9,
  participant:{firstName:'Ольга',lastName:'Петрова'},
  car:{brand:'Toyota',model:'Corolla'},stageInspection:{id:'inspection-old',status:'PASSED',notes:'Проверена'}},
 {id:'reg-inspected',status:'ACTIVE',participantNumber:16,inspection:{id:'inspection-1',status:'FAILED',notes:'Ошибка'}},
];
const make=()=>buildOfflineEventPackage({
 stage:{id:'stage-1',name:'Кубок USD',city:'Казань',date:'2026-11-05'},
 actor:{id:'judge-id',role:'JUDGE'},rows,now,
});

test('minimal package contains only event-site display fields, never contact/private API objects',()=>{
 const data=make();
 assert.equal(data.format,1);
 assert.equal(data.entries.length,3);
 assert.equal(data.entries[0].participantName,'Иванов Иван');
 assert.equal(data.entries[0].number,7);
 assert.equal(data.entries[0].classes[0],'SPL · Limited 2.0');
 assert.equal(data.entries[1].status,'CANCELLED');
 assert.equal(data.entries[1].inspection.status,'PASSED');
 const encoded=JSON.stringify(data);
 for(const secret of ['ivan@example.com','+79999999999','ACCESS_TOKEN_SHOULD_NOT_APPEAR','ownerPhone','private-id-123','secrets'])
  assert.equal(encoded.includes(secret),false,secret+' must not leak to offline vault');
 assert.equal(Date.parse(data.expiresAt)-Date.parse(data.createdAt),OFFLINE_MAX_AGE_MS);
 assertOfflinePackage(data,now);
});

test('offline search supports exact number, Cyrillic and plate while excluding partial number matches',()=>{
 const p=make();
 assert.deepEqual(findOfflineEntries(p,'№7').map(x=>x.id),['reg-active']);
 assert.deepEqual(findOfflineEntries(p,'7').map(x=>x.id),['reg-active']);
 assert.deepEqual(findOfflineEntries(p,'авестa').map(x=>x.id),[]);
 assert.deepEqual(findOfflineEntries(p,'Иванов').map(x=>x.id),['reg-active']);
 assert.deepEqual(findOfflineEntries(p,'А001УР001').map(x=>x.id),['reg-active']);
 assert.deepEqual(findOfflineEntries(p,'SPL').map(x=>x.id),['reg-active']);
 assert.deepEqual(findOfflineEntries(p,'').map(x=>x.id),['reg-active','reg-cancelled','reg-inspected']);
});

test('drafts are immutable, reject cancelled/existing inspected registrations, duplicate submissions and blank failure notes',()=>{
 const p=make();
 assert.throws(()=>recordOfflineInspection(p,'reg-cancelled','PASSED','',now),/отменена/);
 assert.throws(()=>recordOfflineInspection(p,'reg-inspected','PASSED','',now),/уже есть инспекция/);
 assert.throws(()=>recordOfflineInspection(p,'reg-active','FAILED',' ',now),/причину/);
 const draft=recordOfflineInspection(p,'reg-active','FAILED','  Ошибка корпуса  ',now,'op-1');
 assert.equal(p.drafts.length,0);
 assert.equal(draft.drafts[0].status,'FAILED');
 assert.equal(draft.drafts[0].notes,'Ошибка корпуса');
 assert.equal(draft.drafts[0].id,'op-1');
 assert.equal(draft.drafts[0].state,'LOCAL_ONLY');
 assert.equal(draft.drafts[0].baseInspectionId,null);
 assert.throws(()=>recordOfflineInspection(draft,'reg-active','PASSED','',now),/уже сохранён черновик/);
 assertOfflinePackage(draft,now);
});

test('multiple competition numbers on the same car cannot produce duplicate offline inspections',()=>{
 const sameCarRows=[
  {...rows[0],carId:'car-1',car:{...rows[0].car,id:'car-1'}},
  {...rows[0],id:'reg-second-number',carId:'car-1',participantNumber:8,car:{...rows[0].car,id:'car-1'}},
 ];
 const data=buildOfflineEventPackage({stage:{id:'stage1',name:'USD',city:'Казань'},actor:{id:'judge-id',role:'JUDGE'},rows:sameCarRows,now});
 assert.equal(data.entries[0].carId,data.entries[1].carId);
 const saved=recordOfflineInspection(data,'reg-active','PASSED','',now,'offline-op');
 assert.throws(()=>recordOfflineInspection(saved,'reg-second-number','FAILED','Причина',now),/уже сохранён черновик/);
 const inspected=buildOfflineEventPackage({stage:{id:'stage1',name:'USD'},actor:{id:'judge-id',role:'JUDGE'},
  rows:[sameCarRows[0],{...sameCarRows[1],stageInspection:{id:'inspection-existing',status:'PASSED'}}],now});
 assert.throws(()=>recordOfflineInspection(inspected,'reg-active','PASSED','',now),/уже есть инспекция/);
});

test('expired packages and wrong device time never enable offline writes',()=>{
 const p=make();
 assert.throws(()=>assertOfflinePackage(p,now+OFFLINE_MAX_AGE_MS+1),/Срок действия/);
 assert.throws(()=>recordOfflineInspection(p,'reg-active','PASSED','',now+OFFLINE_MAX_AGE_MS+10),/Срок действия/);
 assert.throws(()=>assertOfflinePackage(p,now-6*60_000),/время устройства/);
 assert.throws(()=>assertOfflinePackage({...p,entries:[p.entries[0],p.entries[0]]},now),/Повреждён список/);
});

test('AES-GCM encrypts the full package with a distinct salt and IV; incorrect password/tamper cannot unlock',async()=>{
 const p=make(),password='USD event judge long secret 2026';
 const a=await sealOfflinePackage(p,password),b=await sealOfflinePackage(p,password);
 assert.equal(a.id,'active');assert.notEqual(a.salt,b.salt);assert.notEqual(a.iv,b.iv);
 assert.notEqual(a.revision,b.revision);
 assert.equal(JSON.stringify(a).includes('Иванов'),false);
 const restored=await unsealOfflinePackage(a,password,now);
 assert.deepEqual(restored,p);
 await assert.rejects(unsealOfflinePackage(a,'wrong password',now),/Неверный пароль/);
 const changed={...a,ciphertext:a.ciphertext.slice(0,-4)+'AAAA'};
 await assert.rejects(unsealOfflinePackage(changed,password,now),/Неверный пароль/);
 await assert.rejects(sealOfflinePackage(p,'short'),/минимум 14/);
});

test('offline route is independent of stale JWT and asset worker never stores API responses',async()=>{
 const [app,desk,prepare,template,generator,nginx,packageJson]=await Promise.all([
  readFile(new URL('../src/App.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/OfflineEventPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/EventDayPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../scripts/offline-worker.template.js',import.meta.url),'utf8'),
  readFile(new URL('../scripts/generate-offline-worker.mjs',import.meta.url),'utf8'),
  readFile(new URL('../nginx.conf',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8'),
 ]);
 assert.match(app,/\/offline-event'\)return <OfflineEventPage/);
 assert.match(app,/route==='\/offline-event'\?'День соревнований — USD'/,'offline route sets its own browser title before rendering');
 assert.match(desk,/unsealOfflinePackage\(raw,passphrase\)/);
 assert.match(desk,/state:'LOCAL_ONLY'|ЛОКАЛЬНЫЙ ЧЕРНОВИК/);
 assert.match(prepare,/createOfflineVault\(payload,offlinePass\)/);
 assert.match(template,/if\(url\.pathname!=='\/offline-event'/);
 assert.match(template,/if\(!STATIC\.has\(url\.pathname\)\)return/);
 assert.doesNotMatch(template,/caches\.put\(request/);
 assert.doesNotMatch(template,/event\.respondWith\(fetch\(request\)\)/);
 assert.match(nginx,/location = \/usd-offline-sw\.js/);
 assert.match(packageJson,/generate-offline-worker\.mjs/);
 assert.match(generator,/\.js'.*\.css'|'.js','.css'/);
 const push=await readFile(new URL('../public/usd-push-sw.js',import.meta.url),'utf8');
 assert.match(push,/addEventListener\('push'/);
 assert.doesNotMatch(push,/addEventListener\('fetch'/);
});

test('explicit server receipts survive validation; conflicts retain the local decision',()=>{
 const pkg=make();
 const draft=recordOfflineInspection(pkg,'reg-active','FAILED','Без крепления',now,'op-123');
 const conflict=markOfflineInspectionSync(draft,'op-123','CONFLICT','Уже существует инспекция',undefined,now);
 assert.equal(conflict.drafts[0].state,'CONFLICT');
 assert.equal(conflict.drafts[0].notes,'Без крепления');
 assertOfflinePackage(conflict,now);
 const acknowledged=markOfflineInspectionSync(conflict,'op-123','ACKNOWLEDGED','Сервер подтвердил','inspection-id-1',now);
 assert.equal(acknowledged.drafts[0].serverInspectionId,'inspection-id-1');
 assert.equal(acknowledged.drafts[0].state,'ACKNOWLEDGED');
 assertOfflinePackage(acknowledged,now);
 assert.equal(markOfflineInspectionSync(acknowledged,'op-123','ACKNOWLEDGED','Повтор','inspection-id-1',now),acknowledged);
 assert.throws(()=>markOfflineInspectionSync(acknowledged,'op-123','CONFLICT','Ошибочный откат',undefined,now),/нельзя изменить/);
 assert.throws(()=>markOfflineInspectionSync(draft,'op-123','ACKNOWLEDGED','Без ID',undefined,now),/не предоставил ID/);
});

test('offline sync is explicitly initiated, authenticated, and preserves conflicts',async()=>{
 const page=await readFile(new URL('../src/admin/OfflineEventPage.tsx',import.meta.url),'utf8');
 const service=await readFile(new URL('../../backend/src/inspections/inspections.service.ts',import.meta.url),'utf8');
 assert.match(page,/await refresh\(\)/);
 assert.match(page,/session\.user\.id!==data\.actor\.id/);
 assert.match(page,/apiPost<\{/);
 assert.match(page,/\/inspections\/offline\/sync/);
 assert.match(page,/serverStatus===409/);
 assert.match(page,/updateOfflineVault\(updated,passphrase,activeRevision\)/);
 assert.match(service,/pg_advisory_xact_lock/);
 assert.match(service,/OFFLINE_INSPECTION_SYNCED/);
});

test('QR lookup works fully offline with exact same-origin stage and registration',()=>{
 const current=make(),registrationId='1c7c9b22-69bd-4fa9-9f42-02f06b453f0a';
 current.entries[0].id=registrationId;
 const origin='https://app.usd-russia.ru';
 const qr=origin+'/admin/inspections?stageId=stage-1&registrationId='+registrationId;
 assert.equal(resolveOfflineRegistrationQr(current,qr,origin,now).participantName,'Иванов Иван');
 assert.equal(resolveOfflineRegistrationQr(current,registrationId.toUpperCase(),origin,now).number,7);
 assert.throws(()=>resolveOfflineRegistrationQr(current,qr.replace('stage-1','stage-2'),origin,now),/другому сайту или этапу/);
 assert.throws(()=>resolveOfflineRegistrationQr(current,qr.replace(origin,'https://other.example'),origin,now),/другому сайту или этапу/);
 assert.throws(()=>resolveOfflineRegistrationQr(current,qr+'&admin=true',origin,now),/другому сайту или этапу/);
 assert.throws(()=>resolveOfflineRegistrationQr(current,origin+'/admin/inspections?stageId=stage-1&registrationId=1c7c9b22-69bd-4fa9-9f42-02f06b453f0b',origin,now),/Регистрации нет/);
 assert.throws(()=>resolveOfflineRegistrationQr(current,'javascript:alert(1)',origin,now),/другому сайту или этапу/);
 assert.throws(()=>resolveOfflineRegistrationQr(current,'https://app.usd-russia.ru/admin/inspections?stageId=stage-1&registrationId=invalid',origin,now),/корректный ID/);
 assert.throws(()=>resolveOfflineRegistrationQr(current,qr,origin,now+OFFLINE_MAX_AGE_MS+1),/Срок действия/);
});

test('the offline QR scanner never leaks roster data before unlocking, and camera is optional',async()=>{
 const page=await readFile(new URL('../src/admin/OfflineEventPage.tsx',import.meta.url),'utf8');
 assert.match(page,/resolveOfflineRegistrationQr\(data,rawValue,window\.location\.origin\)/);
 assert.match(page,/window as Window&\{BarcodeDetector\?/);
 assert.match(page,/getUserMedia/);
 assert.match(page,/streamRef\.current\?\.getTracks\(\)/);
 assert.match(page,/QR регистрации без интернета/);
 assert.match(page,/Сбросить QR-поиск/);
 assert.match(page,/этот браузер|Этот браузер/);
});
