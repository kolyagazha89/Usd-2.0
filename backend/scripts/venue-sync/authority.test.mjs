import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {tokenHash,derivedPassphrase,checkAuthority} from './authority.mjs';
const stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
const token=randomBytes(32).toString('base64url');
const pub=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
const grant={stageId:stage,tokenHash:tokenHash(token),baselineSha256:'a'.repeat(64),
 expiresAt:new Date(Date.now()+86400000).toISOString(),revokedAt:null,venueFingerprint:null};
test('stage-bound 256-bit grant and independent laptop Ed25519 key',()=>{
 assert.equal(checkAuthority(grant,token,pub,stage).baselineSha256,grant.baselineSha256);
 assert.match(derivedPassphrase(token),/^UsdSync!1-/);
});
test('wrong token, revoked, expired, swapped key or another stage is refused',()=>{
 const wrong=randomBytes(32).toString('base64url');
 for(const [g,t,id] of [[grant,wrong,stage],[{...grant,revokedAt:new Date()},token,stage],
  [{...grant,expiresAt:new Date(Date.now()-1000).toISOString()},token,stage],
  [grant,token,'a610f672-79f7-44eb-8173-2a8ff94b1c0e'],
  [{...grant,venueFingerprint:'b'.repeat(64)},token,stage]])
  assert.throws(()=>checkAuthority(g,t,pub,id));
});
