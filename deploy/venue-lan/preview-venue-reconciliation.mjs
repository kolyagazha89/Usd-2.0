/**
 * Read-only USD venue-to-central reconciliation preview.
 * This is NOT an apply endpoint. No write query, fetch, or DB dependency.
 *
 * The central latest signed stage snapshot includes ONLY active entrants.
 * The preview can recognize missing/changed numbers and results but must not
 * infer that missing people, cancelled entries or photos are safe to create.
 */
import {createHash,createPublicKey} from 'node:crypto';
import {verifyVenueStageHandoff} from './verify-stage-package.mjs';
import {openVenueReturn} from './venue-return-package.mjs';

const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECISIONS=['READY_FOR_REVIEW','CONFLICT','ALREADY_PRESENT','MANUAL_REVIEW'];
const sha=value=>createHash('sha256').update(value).digest('hex');

function indexCentral(snapshot){
 const resultById=new Map(),resultByClass=new Map(),registrations=new Map();
 const regClassIds=new Set(),numberById=new Map(),numberByNumber=new Map();
 const inspections=new Map(),stageInspections=new Map(),classInspections=new Map();
 for(const reg of snapshot.registrations??[]){
  if(!reg?.id)continue;
  registrations.set(reg.id,reg);
  for(const number of reg.numbers??[]){
   numberById.set(number.id,number);
   numberByNumber.set(Number(number.number),number);
  }
  if(reg.inspection?.id)inspections.set(reg.inspection.id,reg.inspection);
  if(reg.stageInspection?.id)stageInspections.set(reg.stageInspection.id,reg.stageInspection);
  for(const cls of reg.classes??[]){
   regClassIds.add(cls.id);
   if(cls.inspection?.id)classInspections.set(cls.inspection.id,cls.inspection);
  }
  for(const result of reg.results??[]){
   resultById.set(result.id,result);
   resultByClass.set(result.registrationClassId,result);
  }
 }
 return {resultById,resultByClass,registrations,regClassIds,numberById,numberByNumber,
  inspections,stageInspections,classInspections};
}
const same=(a,b)=>a===b||a==null&&b==null;
function scoreMatches(central,local){
 if(!central||!local)return false;
 const left=Number(central.value),right=Number(local.value);
 if(!Number.isFinite(left)||!Number.isFinite(right)||left!==right)return false;
 return same(central.unit,local.unit)
  &&same(central.place,local.place)
  &&same(central.isBest,local.isBest)
  &&same(central.registrationClassId,local.registrationClassId)
  &&same(central.verificationStatus,local.verificationStatus);
}
function status(decision,reason){return {decision,reason}}
function review(event,idx){
 const p=event.payload,old=p.before,after=p.after;
 if(p.operation==='DELETE')return status('MANUAL_REVIEW','DELETION_REQUIRES_ADMIN');
 if(p.table==='Result'){
  const row=idx.resultById.get(p.recordId);
  const assigned=idx.resultByClass.get(after?.registrationClassId??old?.registrationClassId);
  if(row&&after&&scoreMatches(row,after))return status('ALREADY_PRESENT','RESULT_MATCHES');
  if(after?.notes||old?.notes)return status('MANUAL_REVIEW','PRIVATE_NOTES_NOT_IN_PUBLIC_SNAPSHOT');
  if(p.operation==='INSERT'){
   if(!after?.registrationClassId||!idx.regClassIds.has(after.registrationClassId))
    return status('CONFLICT','CLASS_NOT_FOUND');
   if(row||assigned)return status('CONFLICT','CLASS_RESULT_EXISTS');
   return status('READY_FOR_REVIEW','NEW_RESULT');
  }
  if(!row)return status('CONFLICT','RESULT_NOT_FOUND');
  if(!scoreMatches(row,old))return status('CONFLICT','CENTRAL_CHANGED');
  return status('READY_FOR_REVIEW','MATCHED_PRECONDITION');
 }
 if(p.table==='RegistrationNumber'){
  const known=idx.numberById.get(p.recordId),used=idx.numberByNumber.get(Number(after?.number));
  if(known&&after&&same(known.number,after.number)
   &&known.id===after.id)return status('ALREADY_PRESENT','NUMBER_MATCHES');
  if(p.operation==='INSERT'){
   if(used)return status('CONFLICT','START_NUMBER_OCCUPIED');
   if(!idx.registrations.has(after?.registrationId))
    return status('MANUAL_REVIEW','NEW_REGISTRATION_OR_NUMBER_DEPENDENCY');
   return status('MANUAL_REVIEW','NUMBER_REQUIRES_ADMIN');
  }
  return status('MANUAL_REVIEW','NUMBER_REASSIGNMENT_REQUIRES_ADMIN');
 }
 const inspectionMaps={
  Inspection:idx.inspections,
  ParticipantStageInspection:idx.stageInspections,
  RegistrationClassInspection:idx.classInspections,
 };
 if(Object.hasOwn(inspectionMaps,p.table)){
  // Notes/checkedBy identities are not part of the signed central roster;
  // manual reconciliation cannot skip them or fabricate a staff identity.
  return status('MANUAL_REVIEW','INSPECTION_IDENTITY_AND_NOTES');
 }
 if(['Registration','Participant','Car','CarConfiguration',
  'CarConfigurationVersion','CarAmplifier','CarAudioComponent',
  'CarBattery','CarGenerator','CarHeadUnit','RegistrationClass',
  'Stage','Disqualification'].includes(p.table))
  return status('MANUAL_REVIEW','DOMAIN_DEPENDENCY_OR_PRIVATE_DATA');
 return status('MANUAL_REVIEW','UNSUPPORTED_DOMAIN');
}
export function previewVenueReconciliation(venue,central,expected){
 if(!expected||!UUID.test(expected.stageId??'')||!SHA.test(expected.baselineSha256??'')
  ||venue?.stageId!==expected.stageId||central?.stageId!==expected.stageId
  ||venue?.baselineSha256!==expected.baselineSha256)
  throw new Error('Неверный этап или исходный baseline площадки');
 if(!central?.stage||central.stage.id!==expected.stageId
  ||!Array.isArray(central.registrations)||!Array.isArray(venue.events)
  ||!SHA.test(venue.journalEndHash??''))
  throw new Error('Повреждён или неполон снимок этапа');
 const idx=indexCentral(central);
 const summary=Object.fromEntries(DECISIONS.map(d=>[d,0]));
 const resultRows=[];
 let last=0,previous='0'.repeat(64);
 for(const event of venue.events){
  const p=event?.payload;
  if(!p||p.stageId!==expected.stageId||!UUID.test(p.recordId??'')
   ||!Number.isSafeInteger(event.sequence)||event.sequence<=last
   ||p.sequence!==event.sequence||event.previousHash!==previous
   ||!SHA.test(event.hash??''))
   throw new Error('Повреждена последовательность локального журнала');
  last=event.sequence;previous=event.hash;
  let result=review(event,idx);
  if(central.stage.resultsPublishedAt && result.decision!=='ALREADY_PRESENT')
   result=status('CONFLICT','CENTRAL_ALREADY_PUBLISHED');
  summary[result.decision]++;
  resultRows.push({
   sequence:event.sequence,table:p.table,operation:p.operation,
   recordIdHash:sha(String(p.table)+':'+p.recordId),
   ...result,
  });
 }
 if(previous!==venue.journalEndHash)
  throw new Error('Конец локальной цепочки не совпадает с журналом');
 return {
  stageId:expected.stageId,sourceBaselineSha256:venue.baselineSha256,
  journalEndHash:venue.journalEndHash,eventsSeen:venue.events.length,
  currentSignedRosterScope:'ACTIVE_ONLY',summary,rows:resultRows,
  applied:false,canApplyAutomatically:false,
 };
}
/** Both endpoints of the air gap must be explicitly authenticated.
 * Neither unsigned JSON nor a key supplied inside the bundle is trusted.
 */
export function previewAuthenticatedVenueReturn(envelope,passphrase,venuePublicPem,
 centralSigned,centralPublicPem,options){
 if(!options||!SHA.test(options.trustedVenueFingerprint??'')
  ||!SHA.test(options.trustedCentralFingerprint??''))
  throw new Error('Не зафиксированы доверенные ключи двух серверов');
 const venue=openVenueReturn(envelope,passphrase,venuePublicPem,{
  stageId:options.stageId,
  baselineSha256:options.baselineSha256,
  trustedFingerprint:options.trustedVenueFingerprint,
  now:options.now??Date.now(),
 });
 const trustedCentral=createPublicKey(centralPublicPem);
 if(trustedCentral.asymmetricKeyType!=='ed25519'
  ||sha(trustedCentral.export({type:'spki',format:'der'}))!==options.trustedCentralFingerprint)
  throw new Error('Неверный доверенный ключ центрального сервера');
 const newest=verifyVenueStageHandoff(centralSigned,centralPublicPem,
  options.now??Date.now());
 if(newest.stageId!==venue.stageId)
  throw new Error('Центральный пакет другого этапа');
 return previewVenueReconciliation(venue,centralSigned.snapshot,options);
}
