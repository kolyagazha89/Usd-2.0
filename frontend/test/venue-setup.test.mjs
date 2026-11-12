import test from 'node:test';
import assert from 'node:assert/strict';
import {trustedVenueKey,validateVenueDownload} from '../src/admin/venue-setup-model.ts';
const now=Date.now();
const setup={signing:{ready:true,publicKeyPem:'-----BEGIN PUBLIC KEY-----\nexample\n-----END PUBLIC KEY-----',fingerprint:'a'.repeat(64)},centralSyncReady:false,fieldAcceptanceComplete:false};
const data={snapshot:{stageId:'selected',generatedAt:new Date(now).toISOString(),expiresAt:new Date(now+10000).toISOString(),syncAuthorization:{token:'A'.repeat(43),expiresAt:new Date(now+3600000).toISOString()}},integrity:{algorithm:'Ed25519',signature:'b'.repeat(86),sha256:'c'.repeat(64),publicKeyFingerprint:setup.signing.fingerprint}};
test('stage download validates independently loaded trust identity and freshness',()=>{
 const result=validateVenueDownload(data,'selected',setup,now);
 assert.deepEqual(JSON.parse(result.text),data);
 assert.throws(()=>trustedVenueKey({...setup,signing:{...setup.signing,ready:false}}),/не настроен/);
});
test('refuses a different stage, expired file, changed signing key and wrong algorithm',()=>{
 for(const changed of [null,{},
  {...data,snapshot:{...data.snapshot,stageId:'other'}},
  {...data,snapshot:{...data.snapshot,expiresAt:new Date(now-1).toISOString()}},
  {...data,snapshot:{...data.snapshot,expiresAt:new Date(now+73*3600000).toISOString()}},
  {...data,integrity:{...data.integrity,publicKeyFingerprint:'d'.repeat(64)}},
  {...data,integrity:{...data.integrity,algorithm:'none'}},
  {...data,snapshot:{...data.snapshot,syncAuthorization:undefined}},
  {...data,snapshot:{...data.snapshot,syncAuthorization:{token:'invalid',expiresAt:new Date(now+3600000).toISOString()}}},
 ])assert.throws(()=>validateVenueDownload(changed,'selected',setup,now),/не прошёл/);
});
