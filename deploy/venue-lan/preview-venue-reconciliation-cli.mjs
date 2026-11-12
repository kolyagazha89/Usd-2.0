#!/usr/bin/env node
/** Authenticated, read-only central reconciliation report.
 * No network, no Prisma, no SQL, no central mutation side effects.
 */
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {previewAuthenticatedVenueReturn} from './preview-venue-reconciliation.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
async function passphraseFromStdin(){
 let result='';
 for await (const b of process.stdin){
  result+=b.toString('utf8');
  if(result.length>4096)throw Error('Passphrase exceeds limit');
 }
 return result.replace(/\r?\n$/,'');
}
async function inputFile(path,cap){
 if((await stat(path)).size>cap)throw Error('Invalid file size');
 return readFile(path,'utf8');
}
async function main(){
 const args=process.argv.slice(2);
 if(args.length!==8)throw Error('Expected 8 inputs');
 const [encryptedFile,venuePublicFile,currentStageFile,centralPublicFile,
  stageId,baselineSha256,venueFingerprint,centralFingerprint]=args;
 if(!UUID.test(stageId)||![baselineSha256,venueFingerprint,centralFingerprint].every(s=>SHA.test(s??'')))
  throw Error('Invalid pinned identifiers');
 const [encrypted,venuePem,current,centralPem,passphrase]=await Promise.all([
  inputFile(encryptedFile,42*1024*1024).then(JSON.parse),
  inputFile(venuePublicFile,4096),
  inputFile(currentStageFile,13*1024*1024).then(JSON.parse),
  inputFile(centralPublicFile,4096),
  passphraseFromStdin(),
 ]);
 const report=previewAuthenticatedVenueReturn(encrypted,passphrase,
  venuePem,current,centralPem,{
   stageId,baselineSha256,
   trustedVenueFingerprint:venueFingerprint,
   trustedCentralFingerprint:centralFingerprint,now:Date.now(),
  });
 process.stdout.write('USD CENTRAL RETURN CONFLICT PREVIEW — READ ONLY\n');
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 if(report.summary.CONFLICT||report.summary.MANUAL_REVIEW)
  process.exitCode=3; // explicit attention required, not a successful sync
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{
  console.error('USD RETURN PREVIEW REFUSED: signed stage/venue keys, passphrase, baseline or scope invalid');
  process.exitCode=1;
 });
}
