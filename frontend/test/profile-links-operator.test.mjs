import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {afterProfileLinkDecision} from '../src/admin/profile-link-operator-model.ts';

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
