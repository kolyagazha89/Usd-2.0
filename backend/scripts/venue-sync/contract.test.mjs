import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const file=p=>readFile(new URL(p,import.meta.url));
test('central-import cryptographic code is byte-identical to the tested venue cryptography',async()=>{
 for(const name of ['full-return-apply.mjs','venue-return-package.mjs']){
  const central=await file('./'+name);
  const venue=await file('../../../deploy/venue-lan/'+name);
  assert.equal(createHash('sha256').update(central).digest('hex'),
   createHash('sha256').update(venue).digest('hex'),name);
 }
});
