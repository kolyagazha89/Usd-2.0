import test from 'node:test';
import assert from 'node:assert/strict';
import { planRegistrationProtocolConsent } from '../src/participant/registration-protocol.ts';

test('prior accepted consent does not require any new checkbox or PATCH',()=>{
 assert.deepEqual(planRegistrationProtocolConsent({accepted:true,legalReady:true,version:'7@doc1'},false),{needsSave:false,version:'7@doc1',error:null});
});
test('minor cannot submit a personal protocol publication opt-in; guardian handles on-site',()=>{
 const r=planRegistrationProtocolConsent({accepted:false,legalReady:true,version:'7@doc1',requiresRepresentative:true},true);
 assert.equal(r.needsSave,false);
 assert.match(r.error??'',/несовершеннолетнего/);
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

test('registration form confirms protocol inline without losing selected car or classes',async()=>{
 const {readFile}=await import('node:fs/promises');
 const src=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
 assert.match(src,/planRegistrationProtocolConsent\(protocolConsentState,stageProtocolConsentChecked\)/);
 assert.match(src,/checked=\{stageProtocolConsentChecked\}/);
 assert.match(src,/if\(protocolPlan.needsSave\)/);
 assert.match(src,/protocolConsentState\.version/);
 assert.match(src,/apiPatch<any>\('\/auth\/protocol-consent'/);
 assert.match(src,/apiPost\('\/registrations\/me'/);
 assert.ok(src.indexOf("apiPatch<any>('/auth/protocol-consent',{consent:true,version:protocolPlan.version})")
  < src.indexOf("apiPost('/registrations/me'"));
});
