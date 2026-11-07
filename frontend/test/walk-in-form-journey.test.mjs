import test from 'node:test';
import assert from 'node:assert/strict';
import {walkInStepProgress,walkInNextStep} from '../src/admin/walk-in-form-journey.ts';
const registration={participantId:'person',carId:'car',classIds:['c1'],primaryClassCount:1,legalReady:true,privacyConsent:true,termsAccepted:true,rulesAccepted:true};
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
 for(const prop of ['legalReady','privacyConsent','termsAccepted','rulesAccepted'])assert.equal(walkInStepProgress({...registration,[prop]:false})[2],false,prop);
});
