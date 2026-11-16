import test from 'node:test';
import assert from 'node:assert/strict';
import { planRegistrationProtocolConsent } from '../src/participant/registration-protocol.ts';

test('prior accepted consent does not require any new checkbox or PATCH',()=>{
 assert.deepEqual(planRegistrationProtocolConsent({accepted:true,legalReady:true,version:'7@doc1'},false),{needsSave:false,version:'7@doc1',error:null});
});
test('unpublished official protocol document always blocks new registration',()=>{
 const r=planRegistrationProtocolConsent({accepted:false,legalReady:false,version:null},true);
 assert.equal(r.needsSave,false);
 assert.match(r.error??'',/документ|утвержд/);
});
test('unaccepted protocol requires a separate unchecked-by-default choice before registration',()=>{
 const r=planRegistrationProtocolConsent({accepted:false,legalReady:true,version:'7@doc1'},false);
 assert.equal(r.needsSave,false);
 assert.match(r.error??'',/отдельно|подтвердите/i);
});
test('accepted separate checkbox schedules version-bound PATCH once',()=>{
 assert.deepEqual(planRegistrationProtocolConsent({accepted:false,legalReady:true,version:'7@doc1'},true),{needsSave:true,version:'7@doc1',error:null});
});
test('missing document version never records invalid permission',()=>{
 const r=planRegistrationProtocolConsent({accepted:false,legalReady:true,version:null},true);
 assert.equal(r.needsSave,false);
 assert.ok(r.error);
});
