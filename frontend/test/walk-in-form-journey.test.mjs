import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {walkInStepProgress,walkInNextStep,walkInConfigurationOptions,walkInConsentForSelection,walkInAfterProfileCreation} from '../src/admin/walk-in-form-journey.ts';
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

test('newly created profile keeps all four consents and advances directly to classes',()=>{
 const consent=walkInConsentForSelection(registration,'','new-person',true);
 assert.deepEqual(consent,{privacyConsent:true,termsAccepted:true,rulesAccepted:true,protocolConsent:true});
 assert.equal(walkInAfterProfileCreation({...registration,...consent,participantId:'new-person',carId:'new-car'}),1);
});
test('choosing another existing profile never transfers consent from previous identity',()=>{
 assert.deepEqual(walkInConsentForSelection(registration,'person','another',false),{privacyConsent:false,termsAccepted:false,rulesAccepted:false,protocolConsent:false});
 assert.equal(walkInConsentForSelection(registration,'person','person',false).protocolConsent,true);
});
test('profile creation with only intake consents stays on identity until other required consents are confirmed',()=>{
 assert.equal(walkInAfterProfileCreation({...registration,protocolConsent:false}),0);
 assert.equal(walkInAfterProfileCreation({...registration,rulesAccepted:false}),0);
 assert.equal(walkInAfterProfileCreation({...registration,carId:''}),0);
});

test('gate form wires successful profile creation to retained consent and selected car without a second confirmation',async()=>{
 const source=await readFile(new URL('../src/admin/InspectionsPage.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/useEffect\(\(\)=>\{setProtocolConsent\(false\)\},\[participantId\]\)/);
 assert.match(source,/selectParticipant\(created\.participantId,true\)/);
 assert.match(source,/setCars\(\[createdCar\]\);setCarId\(created\.carId\)/);
 assert.match(source,/setWalkInStep\(walkInAfterProfileCreation\(/);
 assert.match(source,/if\(!createdId\)\{setCars\(\[\]\);setCarId\(''\)/);
 assert.match(source,/setProtocolConsent\(consent\.protocolConsent\)/);
});
