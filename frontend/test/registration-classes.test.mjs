import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_REGISTRATION_CLASSES,nextRegistrationClassIds} from '../src/participant/registration-classes.ts';

test('participant can choose at most five classes while preserving primary class order',()=>{
 assert.equal(MAX_REGISTRATION_CLASSES,5);
 const selected=['a','b','c','d','e'];
 assert.deepEqual(nextRegistrationClassIds(selected,'f',true),selected);
 assert.deepEqual(nextRegistrationClassIds(selected,'c',true),selected);
 assert.deepEqual(nextRegistrationClassIds(selected,'a',false),['b','c','d','e']);
 assert.deepEqual(nextRegistrationClassIds(['b','c','d','e'],'f',true),['b','c','d','e','f']);
 assert.deepEqual(selected,['a','b','c','d','e'],'selection must be immutable');
});
test('unchecking a class removes it and duplicate clicks do not add it twice',()=>{
 assert.deepEqual(nextRegistrationClassIds(['a','b'],'b',false),['a']);
 assert.deepEqual(nextRegistrationClassIds(['a'],'a',true),['a']);
 assert.deepEqual(nextRegistrationClassIds([],'a',true),['a']);
});
