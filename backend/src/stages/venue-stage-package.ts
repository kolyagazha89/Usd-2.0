import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export const VENUE_STAGE_FORMAT=1;
export const VENUE_STAGE_TTL_MS=72*60*60*1000;
export const VENUE_STAGE_MAX_BYTES=12*1024*1024;

export type VenueStageSnapshot={
 format:1;
 purpose:'USD_VENUE_STAGE_READONLY';
 stageId:string;
 generatedAt:string;
 expiresAt:string;
 stage:unknown;
 registrations:unknown[];
 venuePolicy?:unknown;
 syncAuthorization?:{token:string;expiresAt:string};
};
export type VenueSignedStagePackage={
 snapshot:VenueStageSnapshot;
 integrity:{algorithm:'Ed25519';sha256:string;signature:string;publicKeyFingerprint:string};
};

const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
const looksLikeSha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export function signVenueStageSnapshot(snapshot:VenueStageSnapshot,privatePemB64:string):VenueSignedStagePackage {
 if(!privatePemB64||privatePemB64.length>16384)throw new Error('VENUE_STAGE_SIGNING_KEY_B64 is not configured');
 const key=createPrivateKey(Buffer.from(privatePemB64,'base64').toString('utf8'));
 if(key.asymmetricKeyType!=='ed25519')throw new Error('Venue export requires an Ed25519 signing key');
 // Normalize Prisma dates/decimals and remove prototype-dependent values.
 const plain=JSON.parse(JSON.stringify(snapshot)) as VenueStageSnapshot;
 const bytes=Buffer.from(JSON.stringify(plain),'utf8');
 if(bytes.length>VENUE_STAGE_MAX_BYTES)throw new Error('Venue stage package exceeds 12 MiB');
 const publicDer=createPublicKey(key).export({type:'spki',format:'der'});
 return {
  snapshot:plain,
  integrity:{
   algorithm:'Ed25519',
   sha256:hash(bytes),
   signature:sign(null,bytes,key).toString('base64url'),
   publicKeyFingerprint:hash(publicDer),
  },
 };
}

/** Pure signature+scope check shared by tests and the read-only export.
 * A signature is NOT an authorization grant to import data into any DB.
 */
export function verifyVenueStagePackage(
 value:unknown,publicPem:string,now=Date.now(),
):VenueStageSnapshot {
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new Error('Invalid venue package');
 const signed=value as Partial<VenueSignedStagePackage>;
 const snapshot=signed.snapshot;
 const integrity=signed.integrity;
 if(!snapshot||!integrity||snapshot.format!==VENUE_STAGE_FORMAT
  ||snapshot.purpose!=='USD_VENUE_STAGE_READONLY'
  ||typeof snapshot.stageId!=='string'||!snapshot.stageId
  ||!Array.isArray(snapshot.registrations)||snapshot.registrations.length>2500
  ||integrity.algorithm!=='Ed25519'||!looksLikeSha(integrity.sha256)
  ||!looksLikeSha(integrity.publicKeyFingerprint)
  ||typeof integrity.signature!=='string'
  ||!/^[A-Za-z0-9_-]{64,180}$/.test(integrity.signature))
  throw new Error('Unsupported or corrupt venue package');
 const created=Date.parse(String(snapshot.generatedAt));
 const expires=Date.parse(String(snapshot.expiresAt));
 if(!Number.isFinite(created)||!Number.isFinite(expires)||!Number.isFinite(now)
  ||expires-created>VENUE_STAGE_TTL_MS||expires<=created
  ||now>expires||now<created-5*60*1000)
  throw new Error('Venue package expired or device clock invalid');
 if(snapshot.syncAuthorization!==undefined){
  if(!/^[A-Za-z0-9_-]{43}$/.test(snapshot.syncAuthorization.token)
   ||Date.parse(snapshot.syncAuthorization.expiresAt)<=created
   ||Date.parse(snapshot.syncAuthorization.expiresAt)-created>31*86400000)
   throw new Error('Invalid venue sync authorization');
 }
 const bytes=Buffer.from(JSON.stringify(snapshot),'utf8');
 if(bytes.length>VENUE_STAGE_MAX_BYTES||hash(bytes)!==integrity.sha256)
  throw new Error('Venue package integrity failed');
 const publicKey=createPublicKey(publicPem);
 if(publicKey.asymmetricKeyType!=='ed25519')throw new Error('Venue package requires an Ed25519 public key');
 const fingerprint=hash(publicKey.export({type:'spki',format:'der'}));
 if(integrity.publicKeyFingerprint!==fingerprint
  ||!verify(null,bytes,publicKey,Buffer.from(integrity.signature,'base64url')))
  throw new Error('Venue package signature invalid');
 return snapshot;
}
