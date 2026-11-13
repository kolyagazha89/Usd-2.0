import {createHash,createPublicKey,timingSafeEqual} from 'node:crypto';
export function tokenHash(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))throw Error('Invalid venue key');
 return createHash('sha256').update(value).digest('hex');
}
export function derivedPassphrase(token){tokenHash(token);return 'UsdSync!1-'+token}
export function checkAuthority(grant,token,publicPem,stageId,now=Date.now()){
 if(!grant||grant.stageId!==stageId||grant.revokedAt
  ||!Number.isFinite(Date.parse(grant.expiresAt))
  ||Date.parse(grant.expiresAt)<=now)throw Error('Venue permission inactive');
 const a=Buffer.from(tokenHash(token),'hex'),b=Buffer.from(grant.tokenHash??'','hex');
 if(b.length!==32||!timingSafeEqual(a,b))throw Error('Venue key not authorized');
 if(typeof publicPem!=='string'||publicPem.length>4096)throw Error('Invalid venue public key');
 const pub=createPublicKey(publicPem);
 if(pub.asymmetricKeyType!=='ed25519')throw Error('Invalid signature algorithm');
 const fingerprint=createHash('sha256').update(pub.export({type:'spki',format:'der'})).digest('hex');
 if(grant.venueFingerprint&&grant.venueFingerprint!==fingerprint)throw Error('Another laptop pinned');
 return {fingerprint,baselineSha256:grant.baselineSha256};
}
/** Never acknowledge a partial/mismatched central replay, even if a future
 * adapter regression returns without throwing. Full return is all-or-none.
 */
export function assertCompleteReturn(report,stageId,journalEndHash,eventCount){
 if(!report||report.databaseSynchronized!==true||report.stageId!==stageId
  ||report.journalEndHash!==journalEndHash
  ||typeof journalEndHash!=='string'||!/^[a-f0-9]{64}$/.test(journalEndHash)
  ||!Number.isSafeInteger(eventCount)||eventCount<0
  ||report.totalEvents!==eventCount
  ||(report.alreadyApplied===true?report.appliedEvents!==0:report.appliedEvents!==eventCount))
  throw Error('Incomplete or mismatched central return');
 return true;
}
