#!/usr/bin/env node
/** Pure offline return-envelope verification. NO central DB connection/writes. */
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {openVenueReturn} from './venue-return-package.mjs';
const UUID=/^[a-f0-9-]{36}$/i,SHA=/^[a-f0-9]{64}$/;
async function stdinPassphrase(){
 let secret='';
 for await(const chunk of process.stdin){
  secret+=chunk.toString('utf8');
  if(secret.length>4096)throw new Error('Слишком длинная фраза');
 }
 return secret.replace(/\r?\n$/,'');
}
async function main(){
 const [file,publicKeyFile,stageId,baselineSha256,trustedFingerprint,...extra]=process.argv.slice(2);
 if(!file||!publicKeyFile||!UUID.test(stageId)
  ||!SHA.test(baselineSha256??'')||!SHA.test(trustedFingerprint??'')||extra.length)
  throw Error('Usage: verify-venue-return.mjs ENCRYPTED.json TRUSTED_VENUE_PUBLIC.pem STAGE_UUID BASELINE_SHA256 TRUSTED_PUBLIC_FINGERPRINT');
 const size=(await stat(file)).size;
 if(size>42*1024*1024)throw Error('Oversized USB envelope');
 const [raw,pem,passphrase]=await Promise.all([
  readFile(file,'utf8'),readFile(publicKeyFile,'utf8'),stdinPassphrase(),
 ]);
 const snapshot=openVenueReturn(JSON.parse(raw),passphrase,pem,{
  stageId,baselineSha256,trustedFingerprint,now:Date.now(),
 });
 process.stdout.write('USD VENUE RETURN VERIFIED (READ ONLY, NOT APPLIED)\n');
 process.stdout.write(JSON.stringify({
  stageId:snapshot.stageId,baselineSha256:snapshot.baselineSha256,
  eventCount:snapshot.eventCount,journalEndHash:snapshot.journalEndHash,
  generatedAt:snapshot.generatedAt,expiresAt:snapshot.expiresAt,
 })+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{
  console.error('USD RETURN NOT ACCEPTED: check passphrase, separately trusted key, stage, baseline and expiry');
  process.exitCode=1;
 });
}
