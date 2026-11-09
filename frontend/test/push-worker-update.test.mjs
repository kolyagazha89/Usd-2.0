import test from 'node:test';
import assert from 'node:assert/strict';
import {updateExistingPushWorker} from '../src/push/update-existing-worker.ts';
test('existing push worker is refreshed without asking permission or creating a subscription',async()=>{
 let updates=0,lookups=0;
 const container={getRegistration:async scope=>{assert.equal(scope,'https://usd.test/');lookups++;return {active:{scriptURL:'https://usd.test/usd-push-sw.js'},update:async()=>{updates++}}}};
 await updateExistingPushWorker(container,'https://usd.test');assert.equal(lookups,1);assert.equal(updates,1);
});
test('does not replace offline or foreign workers and does not register unsubscribed browsers',async()=>{
 for(const scriptURL of ['https://usd.test/usd-offline-sw.js','https://other.test/usd-push-sw.js']){
  let updates=0;await updateExistingPushWorker({getRegistration:async()=>({active:{scriptURL},update:async()=>{updates++}})},'https://usd.test');assert.equal(updates,0);
 }
 await updateExistingPushWorker({getRegistration:async()=>undefined},'https://usd.test');
 await updateExistingPushWorker(undefined,'https://usd.test');
});
test('update failures cannot block app startup',async()=>{
 await assert.doesNotReject(updateExistingPushWorker({getRegistration:async()=>{throw Error('offline')}},'https://usd.test'));
 await assert.doesNotReject(updateExistingPushWorker({getRegistration:async()=>({active:{scriptURL:'https://usd.test/usd-push-sw.js'},update:async()=>{throw Error('offline')}})},'https://usd.test'));
});

test('does not interrupt a pending migration to a different worker',async()=>{
 let updates=0;await updateExistingPushWorker({getRegistration:async()=>({active:{scriptURL:'https://usd.test/usd-push-sw.js'},waiting:{scriptURL:'https://usd.test/offline-sw.js'},update:async()=>{updates++}})},'https://usd.test');assert.equal(updates,0);
});
