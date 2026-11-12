#!/usr/bin/env node
/**
 * Central Ubuntu operator workflow for a complete offline JOURNAL, not media.
 * No exposed REST endpoint: no LAN credential, public key, or DB URL is trusted
 * from an uploaded bundle. Fail closed and retain laptop state on any conflict.
 */
import {readFile,stat} from 'node:fs/promises';
import {createHash,createPublicKey} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {openVenueReturn} from '../../deploy/venue-lan/venue-return-package.mjs';
import {applyCompleteVenueJournal} from '../../deploy/venue-lan/full-return-apply.mjs';
import {postgresFullVenueAdapter} from './venue-full-adapter.mjs';

const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function file(file,max){
 const info=await stat(file);
 if(!info.isFile()||info.size<1||info.size>max)
  throw Error('Return file missing or exceeds size limit');
 return readFile(file,'utf8');
}
async function passwordFromStdin(){
 let result='';
 for await(const data of process.stdin){
  result+=data.toString('utf8');
  if(result.length>4096)throw Error('Transfer passphrase too long');
 }
 return result.replace(/\r?\n$/,'');
}
export async function applyCompleteVenueReturn({
 files,environment=process.env,passphrase=passwordFromStdin(),onReport=console.log,
}){
 const [encryptedPath,pubPath,mode]=files;
 if(!encryptedPath||!pubPath||!['--dry-run','--apply'].includes(mode))
  throw Error('Usage: node scripts/apply-complete-venue-return.mjs RETURN.json VENUE_PUBLIC.pem --dry-run|--apply');
 const stageId=environment.VENUE_RETURN_STAGE_ID;
 const baselineSha256=environment.VENUE_RETURN_BASELINE_SHA256;
 const pinned=environment.VENUE_RETURN_TRUSTED_FINGERPRINT;
 if(!UUID.test(stageId??'')||![baselineSha256,pinned].every(x=>SHA.test(x??'')))
  throw Error('Confirm stage, signed original baseline and independently pinned venue key');
 if(environment.USD_VENUE_LAN_MODE==='true')throw Error('Refusing to run on offline LAN');
 const apply=mode==='--apply';
 if(apply&&(environment.VENUE_RETURN_APPLY_CONFIRM!==stageId
  ||environment.VENUE_RETURN_BACKUP_VERIFIED!==stageId
  ||(environment.VENUE_RETURN_OPERATOR??'').trim().length<3))
  throw Error('Central administrator must confirm stage UUID, verified backup and operator');
 const [encrypted,pem,secret]=await Promise.all([
  file(encryptedPath,42*1024*1024),file(pubPath,4096),passphrase,
 ]);
 const key=createPublicKey(pem);
 if(key.asymmetricKeyType!=='ed25519'
  ||createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex')!==pinned)
  throw Error('Independent venue key fingerprint mismatch');
 const snapshot=openVenueReturn(JSON.parse(encrypted),secret,pem,{
  stageId,baselineSha256,trustedFingerprint:pinned,now:Date.now(),
 });
 if(!environment.DATABASE_URL||environment.DATABASE_URL.length<20)
  throw Error('Central DATABASE_URL not provided');
 const client=new pg.Client({connectionString:environment.DATABASE_URL,
  application_name:'usd_full_offline_return'});
 try{
  await client.connect();
  const db=(await client.query('SELECT current_database() AS name')).rows[0].name;
  if(/^usd_venue(?:_|$)/.test(db))
   throw Error('Isolated venue database detected; no central import');
  const report=await applyCompleteVenueJournal(snapshot,postgresFullVenueAdapter(client),{
   apply,stageId,baselineSha256,operator:environment.VENUE_RETURN_OPERATOR,
  });
  let derivedRankingsRebuilt=false;
  if(apply&&report.databaseSynchronized&&report.totalEvents>0){
   try{
    // Idempotent derived records/re-ranking step after all DB receipts commit.
    // An interrupted rebuild can be retried with the same signed package.
    const entry=await import('../dist/scripts/finalize-venue-return.js');
    const finalize=entry.finalizeVenueStage??entry.default?.finalizeVenueStage;
    if(typeof finalize!=='function')throw Error('Central ranking finalizer missing');
    const state=await finalize(stageId,environment.DATABASE_URL);
    derivedRankingsRebuilt=Boolean(state?.recalculated);
   }catch{
    report.finalization='REQUIRES_ADMIN_RETRY';
   }
  }
  onReport(JSON.stringify({...report,
   derivedRankingsRebuilt,officialReleaseAccepted:false,
   rankingsNeedRebuild:apply&&snapshot.events.length>0&&!derivedRankingsRebuilt,
   onSiteFieldAcceptanceRequired:true},null,2));
  // Status 4 signals "database imported but no media/field acceptance":
  // never accidentally mark the entire contest as RELEASED.
  if(apply)process.exitCode=4;
  return report;
 }finally{await client.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 applyCompleteVenueReturn({files:process.argv.slice(2)}).catch(()=>{
  console.error('USD FULL RETURN REFUSED. Keep local journal, database and USB package.');
  process.exitCode=1;
 });
}
