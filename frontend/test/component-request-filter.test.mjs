import test from 'node:test';
import assert from 'node:assert/strict';
import {filterComponentRequests} from '../src/admin/component-request-filter.ts';

test('filters request status, category and searchable details without mutating the queue',()=>{
 const items=[{status:'PENDING',category:'AMPLIFIER',brand:'Kicx',model:'Uno',details:'Rare',userEmail:'a@example.com'}, {status:'APPROVED',category:'DSP',brand:'Aura',model:'X',adminNote:'Done'}];
 assert.deepEqual(filterComponentRequests(items,'PENDING','ALL','rare'),[items[0]]);
 assert.deepEqual(filterComponentRequests(items,'RESOLVED','DSP','done'),[items[1]]);
 assert.equal(filterComponentRequests(items,'ALL','AMPLIFIER','a@example').length,1);
 assert.equal(items.length,2);
});
