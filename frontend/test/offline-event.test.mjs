import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildOfflineEventPackage,assertOfflinePackage,recordOfflineInspection,findOfflineEntries,OFFLINE_MAX_AGE_MS} from '../src/admin/offline-event-model.ts';
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
 assert.throws(()=>recordOfflineInspection(p,'reg-inspected','PASSED','',now),/уже была/);
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
