import test from 'node:test';
import assert from 'node:assert/strict';
import {logoHaptic} from '../src/public/logo-haptics.ts';
test('haptics require a user gesture and respect reduced motion',()=>{
 const calls=[];const device={vibrate:pattern=>{calls.push(pattern);return true}};
 assert.equal(logoHaptic(device,false,false),false);assert.equal(logoHaptic(device,true,true),false);assert.deepEqual(calls,[]);
 assert.equal(logoHaptic(device,true,false),true);assert.deepEqual(calls,[[35,35,65]]);
});
test('unsupported or blocked haptics do not break the visual interaction',()=>{
 assert.equal(logoHaptic({},true,false),false);assert.equal(logoHaptic({vibrate:()=>false},true,false),false);assert.equal(logoHaptic({vibrate:()=>{throw Error('blocked')}},true,false),false);
});
