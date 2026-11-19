import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {afterProfileLinkDecision,filterProfileLinkRequests} from '../src/admin/profile-link-operator-model.ts';

const requests=[
 {id:'first',status:'PENDING',claimant:{email:'a@example.test'}},
 {id:'second',status:'PENDING',claimant:{email:'b@example.test'}},
];

test('confirmed request is immediately removed from pending queue after successful API write',()=>{
 const updated=afterProfileLinkDecision(requests,'first','APPROVE','PENDING');
 assert.deepEqual(updated.map(x=>x.id),['second']);
 assert.equal(requests[0].status,'PENDING','server source objects remain unchanged');
});

test('historical/all review lists replace the decision status in place',()=>{
 const approved=afterProfileLinkDecision(requests,'first','APPROVE','');
 assert.equal(approved[0].status,'APPROVED');
 const rejected=afterProfileLinkDecision(requests,'second','REJECT','');
 assert.equal(rejected[1].status,'REJECTED');
 assert.equal(rejected[0],requests[0],'untouched rows retain identity');
});

test('review action announces confirmed decision and refresh is not used as the only UI update',async()=>{
 const code=await readFile(new URL('../src/admin/ProfileLinksPage.tsx',import.meta.url),'utf8');
 assert.match(code,/afterProfileLinkDecision\(current,row\.id,decision,status\)/);
 assert.match(code,/reviewNotice&&<p[^>]*role="status"/);
 assert.match(code,/setReviewNotice\('Привязка подтверждена'/);
 assert.match(code,/setReviewNotice\('Заявка отклонена'/);
});

test('profile request search matches claimant email, full name and notes without case sensitivity',()=>{
 const users=[
  {id:'x',status:'PENDING',claimant:{email:'IVAN@USD.TEST'},participant:{firstName:'Иван',lastName:'Петров',middleName:'Игоревич'},note:'Новая машина'},
  {id:'y',status:'PENDING',claimant:{email:'alena@usd.test'},participant:{firstName:'Алёна',lastName:'Сидорова'},note:'Архив 2020'},
 ];
 assert.deepEqual(filterProfileLinkRequests(users,'  IVAN@usd ' ).map(x=>x.id),['x']);
 assert.deepEqual(filterProfileLinkRequests(users,'сидорова алёна').map(x=>x.id),['y']);
 assert.deepEqual(filterProfileLinkRequests(users,'2020').map(x=>x.id),['y']);
 assert.equal(filterProfileLinkRequests(users,'несуществующий').length,0);
 assert.equal(filterProfileLinkRequests(users,'').length,2);
});

test('profile-link queue has live find and reset controls',async()=>{
 const source=await readFile(new URL('../src/admin/ProfileLinksPage.tsx',import.meta.url),'utf8');
 assert.match(source,/aria-label="Поиск заявок по ФИО или email"/);
 assert.match(source,/filterProfileLinkRequests\(rows,query\)/);
 assert.match(source,/Сбросить поиск заявок/);
 assert.match(source,/По вашему запросу заявок не найдено/);
});
