import test from 'node:test';
import assert from 'node:assert/strict';
import {walkInStepProgress,walkInNextStep,walkInConfigurationOptions,walkInConsentAfterSelection} from '../src/admin/walk-in-form-journey.ts';
const registration={participantId:'person',carId:'car',classIds:['c1'],primaryClassCount:1,legalReady:true,privacyConsent:true,termsAccepted:true,rulesAccepted:true,protocolConsent:true};
test('on-site registration gates each stage without discarding data',()=>{
 assert.deepEqual(walkInStepProgress(registration),[true,true,true]);
 assert.deepEqual(walkInStepProgress({...registration,carId:''}),[false,true,true]);
 assert.equal(walkInNextStep(0,walkInStepProgress({...registration,carId:''})),0);
 assert.equal(walkInNextStep(0,walkInStepProgress(registration)),1);
 assert.equal(walkInNextStep(1,walkInStepProgress(registration)),2);
 assert.equal(walkInNextStep(2,walkInStepProgress(registration)),2);
});
test('BassRace allows extra numbers without treating more than five selections as invalid',()=>{
 const extra={...registration,classIds:['spl','br129','br139','br149','br159','brExtra'],primaryClassCount:2};
 assert.equal(walkInStepProgress(extra)[1],true);
 assert.equal(walkInStepProgress({...extra,primaryClassCount:6})[1],false);
});
test('last step requires every legal consent and approved documents',()=>{
 for(const prop of ['legalReady','privacyConsent','termsAccepted','rulesAccepted','protocolConsent'])assert.equal(walkInStepProgress({...registration,[prop]:false})[2],false,prop);
});


test('walk-in intake offers only real configurations and leaves draft-only cars unselected',()=>{
 const draft={id:'draft',version:1,additionalDescription:'USD_ON_SITE_DRAFT_PENDING'};
 const real={id:'saved',version:2};
 assert.deepEqual(walkInConfigurationOptions([{name:'Черновик',versions:[draft]}]),[]);
 assert.deepEqual(walkInConfigurationOptions([{name:'Конфигурация',versions:[draft,real]}]),
  [{id:'saved',label:'Конфигурация · v2'}]);
});

const consents={privacyConsent:true,termsAccepted:true,rulesAccepted:true,protocolConsent:true};
test('saving the current new participant draft preserves all four confirmations exactly',()=>{
 assert.deepEqual(walkInConsentAfterSelection(consents,'','new-person',true),consents);
 const partial={...consents,protocolConsent:false};
 assert.deepEqual(walkInConsentAfterSelection(partial,'','new-person',true),partial);
});
test('switching to a different existing participant clears all prior personal confirmations',()=>{
 const empty={privacyConsent:false,termsAccepted:false,rulesAccepted:false,protocolConsent:false};
 assert.deepEqual(walkInConsentAfterSelection(consents,'person-a','person-b'),empty);
 assert.deepEqual(walkInConsentAfterSelection(consents,'','existing-person'),empty);
 assert.deepEqual(walkInConsentAfterSelection(consents,'person-a',''),empty);
 assert.deepEqual(walkInConsentAfterSelection(consents,'person-a','person-b',true),empty);
 assert.deepEqual(walkInConsentAfterSelection(consents,'person-a','person-a'),consents);
});
test('successful new profile selection keeps the consent state instead of an unconditional participant effect reset',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../src/admin/InspectionsPage.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/useEffect\(\(\)=>\{setProtocolConsent\(false\)\},\[participantId\]\)/);
 assert.match(source,/selectParticipant\(created\.participantId,true\)/);
 assert.match(source,/walkInConsentAfterSelection\(/);
});
