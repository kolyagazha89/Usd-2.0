import {createHash} from 'node:crypto';
import {FULL_RETURN_COVERAGE_TABLES} from './venue-return-package.mjs';
import {canonicalVehiclePlate,participantNamesNeedReview,participantReviewCandidates,venueResolutionHash,conflictKey} from './venue-return-review.mjs';
/**
 * Atomic, explicit operator-approved import of the whole signed LAN journal.
 * This intentionally does NOT apply stage publication, disqualifications,
 * new media blobs, or edits to people without a stage registration.
 *
 * A journal is replayed in its ORIGINAL order under SERIALIZABLE isolation:
 * every write is checked against its signed "before" state. A conflicting
 * number, profile, inspection or score aborts the ENTIRE transaction.
 * Full-journal receipts are committed atomically with the rows and make the
 * same signed package safe to retry after a lost connection.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
export function venueAmplifierLinkId(amplifierId,componentId){
 if(!UUID.test(amplifierId??'')||!UUID.test(componentId??''))throw Error('Invalid amplifier link');
 const digest=createHash('md5').update(amplifierId+'/'+componentId).digest('hex');
 const fixed=digest.slice(0,12)+'5'+digest.slice(13,16)+'8'+digest.slice(17);
 return [fixed.slice(0,8),fixed.slice(8,12),fixed.slice(12,16),fixed.slice(16,20),fixed.slice(20)].join('-');
}
const columns={
 Participant:'id usdIdToken team phone photoUrl isPublic publicationConsent publicationConsentAt publicationConsentVersion publicationRestrictions legacyId historicalAlias createdAt updatedAt birthDate city firstName lastName middleName',
 Car:'id participantId brand model photoUrl isActive legacyId createdAt updatedAt registrationNumber registrationCountry color isPublic',
 CarConfiguration:'id carId name isActive currentVersion createdAt updatedAt',
 CarConfigurationVersion:'id version vibrationIsolation additionalDescription createdAt configurationId',
 CarAmplifier:'id versionId brand catalogEntryId model quantity direction',
 CarAudioComponent:'id versionId brand catalogEntryId model quantity type direction',
 CarBattery:'id versionId brand model quantity',
 CarGenerator:'id versionId brand model quantity',
 CarHeadUnit:'id versionId brand catalogEntryId model direction',
 CarAmplifierComponent:'id amplifierId componentId quantity',
 Registration:'id stageId participantId carId configurationVersionId configurationSnapshot participantNumber teamIdAtInspection teamNameAtInspection teamAffiliationCapturedAt rulesAcceptedAt rulesVersion privacyConsentAt privacyConsentVersion termsAcceptedAt termsVersion protocolConsentAt protocolConsentVersion consentCapturedByUserId source status registeredAt legacyId participantStageInspectionId',
 RegistrationNumber:'id stageId registrationId number isPrimary createdAt',
 RegistrationClass:'id registrationId classId numberId createdAt',
 Inspection:'id registrationId status checkedByUserId createdByUserId checkedByName checkedAt notes createdAt updatedAt legacyId',
 ParticipantStageInspection:'id participantId stageId status checkedByUserId createdByUserId checkedByName checkedAt notes createdAt updatedAt',
 RegistrationClassInspection:'id registrationClassId status checkedByUserId createdByUserId checkedByName checkedAt notes createdAt updatedAt legacyId',
 Result:'id registrationId registrationClassId value unit place isBest notes createdByUserId isHistorical verificationStatus verifiedByUserId verifiedAt createdAt updatedAt',
};
export const RETURN_COLUMNS=Object.freeze(Object.fromEntries(
 Object.entries(columns).map(([table,fields])=>[table,Object.freeze(fields.split(' '))])));
const NO_USER_LINKS=new Set(['checkedByUserId','createdByUserId','verifiedByUserId','consentCapturedByUserId']);
const CASCADE_PROTECTED=new Set(['Participant','Car','CarConfiguration','CarConfigurationVersion']);
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);

// The LAN journal wins only for scoped competition operations. Identity,
// equipment and legal/consent data remain central-owned and never take the
// venue's stale baseline as an update.
const STAGE_WINNERS=new Set([
 'Registration','RegistrationNumber','RegistrationClass','Inspection',
 'ParticipantStageInspection','RegistrationClassInspection','Result',
]);
const PRESERVE_CENTRAL_REGISTRATION=[
 'configurationVersionId','configurationSnapshot',
 'privacyConsentAt','privacyConsentVersion','termsAcceptedAt','termsVersion',
 'rulesAcceptedAt','rulesVersion','protocolConsentAt','protocolConsentVersion',
 'consentCapturedByUserId','source','registeredAt','legacyId',
];
const STAGE_KEYS={
 Registration:['stageId','participantId','carId'],
 RegistrationNumber:['stageId','registrationId'],
 RegistrationClass:['registrationId'],
 Inspection:['registrationId'],
 ParticipantStageInspection:['stageId','participantId'],
 RegistrationClassInspection:['registrationClassId'],
 Result:['registrationId','registrationClassId'],
};
const UNIQUE_STAGE_SLOTS=new Set(['Result','Inspection','ParticipantStageInspection','RegistrationClassInspection']);
function stageWinnerRow(table,actual,after,stageId){
 if(actual&&table==='Registration'&&actual.stageId!==stageId)
  reject('MANUAL_REVIEW: registration belongs to another stage');
 if(actual&&STAGE_KEYS[table].some(key=>!same(actual[key],after?.[key])))
  reject('MANUAL_REVIEW: central stage identity differs for '+table);
 if(table!=='Registration'||!actual||!after)return after;
 // Preserve online legal confirmations and full equipment history even when
 // the LAN imported a snapshot-only FK placeholder before the competition.
 return {...after,...Object.fromEntries(PRESERVE_CENTRAL_REGISTRATION
  .map(key=>[key,actual[key]]))};
}
function sameSignedStageState(table,signed,actual){
 if(table==='Registration'){
  for(const key of PRESERVE_CENTRAL_REGISTRATION){
   delete signed[key];delete actual[key];
  }
 }
 if(table==='Result'){
  for(const key of ['place','isBest','updatedAt']){
   delete signed[key];delete actual[key];
  }
 }
 return same(signed,actual);
}

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const reject=reason=>{throw new Error('USD VENUE FULL RETURN CONFLICT: '+reason)};
function normalize(table,row){
 if(!plain(row)||!UUID.test(row.id??''))reject('invalid row id');
 const permitted=RETURN_COLUMNS[table],seen=new Set(permitted);
 if(!permitted||Object.keys(row).some(key=>!seen.has(key)))
  reject('unknown fields in '+table);
 if(table==='CarAmplifierComponent'
  &&venueAmplifierLinkId(row.amplifierId,row.componentId)!==row.id)
  reject('amplifier link pair identity is invalid');
 const copy={...row};
 for(const name of NO_USER_LINKS){
  // The laptop authenticates judges with separate, local-only User IDs.
  // Never point production foreign keys at those users.
  if(Object.hasOwn(copy,name))copy[name]=null;
 }
 return copy;
}
function stageRefs(event,scope){
 const {table,after,before}=event.payload,r=after??before;
 if(['Registration','RegistrationNumber','ParticipantStageInspection'].includes(table)
  &&r.stageId!==scope.stageId)reject('different stage '+table);
 if(table==='Registration'&&
   (!scope.participants.has(r.participantId)||!scope.cars.has(r.carId)
    ||!scope.versions.has(r.configurationVersionId)))
  reject('unlinked registration graph');
 if(table==='Participant'&&!scope.participants.has(r.id))
  reject('participant outside stage');
 if(table==='Participant'&&event.payload.operation!=='INSERT'
  &&!scope.registeredPeople.has(r.id)&&!scope.newPeople.has(r.id))
  reject('unregistered central identity cannot be changed through a new car');
 if(table==='Car'&&(!scope.cars.has(r.id)||!scope.participants.has(r.participantId)))
  reject('car outside this stage');
 if(table==='CarConfiguration'&&(!scope.configurations.has(r.id)||!scope.cars.has(r.carId)))
  reject('configuration outside this stage');
 if(table==='CarConfigurationVersion'&&(!scope.versions.has(r.id)||!scope.configurations.has(r.configurationId)))
  reject('configuration version outside stage');
 if(['CarAmplifier','CarAudioComponent','CarBattery','CarGenerator','CarHeadUnit'].includes(table)
  &&!scope.versions.has(r.versionId))reject('equipment outside stage configuration');
 if(['RegistrationClass','Inspection','RegistrationNumber','Result'].includes(table)
  &&!scope.registrations.has(r.registrationId))reject('registration outside stage');
 if(table==='CarAmplifierComponent'
  &&(!scope.amplifiers.has(r.amplifierId)||!scope.components.has(r.componentId)))
  reject('amplifier link outside stage configuration');
 if(table==='RegistrationClassInspection'&&!scope.classes.has(r.registrationClassId))
  reject('class inspection outside stage');
 if(table==='Result'&&!scope.classes.has(r.registrationClassId))
  reject('result class outside stage');
 if(table==='ParticipantStageInspection'&&!scope.participants.has(r.participantId))
  reject('inspection participant outside stage');
}
function buildScope(snapshot,original){
 const scope={
  stageId:snapshot.stageId,
  registrations:new Set(original.registrations??[]),
  participants:new Set(original.participants??[]),
  cars:new Set(original.cars??[]),
  registeredPeople:new Set(original.participants??[]),
  newPeople:new Set(),
  configurations:new Set(original.configurations??[]),
  versions:new Set(original.versions??[]),
  classes:new Set(original.classes??[]),
  amplifiers:new Set(original.amplifiers??[]),
  components:new Set(original.components??[]),
 };
 // A visitor can leave after on-site profile+car creation but before the
 // stage registration. Those signed INSERTs must not poison ALL score returns.
 // A standalone Participant with no signed car is never stage-scoped.
 const newCarOwners=new Set(snapshot.events.filter(e=>
  e.payload.table==='Car'&&e.payload.operation==='INSERT')
  .map(e=>e.payload.after?.participantId));
 for(const event of snapshot.events){
  const p=event.payload;
  if(p.operation==='INSERT'&&p.table==='Participant'){
   if(!newCarOwners.has(p.recordId))
    reject('MANUAL_REVIEW: unpaired on-site participant without signed car');
   scope.participants.add(p.recordId);
   scope.newPeople.add(p.recordId);
  }
  if(p.operation==='INSERT'&&p.table==='Car'){
   scope.cars.add(p.recordId);
   scope.participants.add(p.after.participantId);
  }
 }
 for(const e of snapshot.events){
  const p=e.payload,r=p.after??p.before;
  if(p.table==='Registration'&&r?.stageId===scope.stageId){
   scope.registrations.add(r.id);
   scope.participants.add(r.participantId);
   scope.registeredPeople.add(r.participantId);
   scope.cars.add(r.carId);
   scope.versions.add(r.configurationVersionId);
  }
  if(p.table==='RegistrationClass'&&scope.registrations.has(r?.registrationId))
   scope.classes.add(r.id);
 }
 // On-site registration often creates configuration before the Registration,
 // so collect its FK hierarchy by fixed-point, not event order.
 for(let pass=0;pass<4;pass++)for(const e of snapshot.events){
  const p=e.payload,r=p.after??p.before;
  if(p.table==='Car'&&scope.cars.has(r?.id))scope.participants.add(r.participantId);
  if(p.table==='CarAmplifier'&&scope.versions.has(r?.versionId))scope.amplifiers.add(r.id);
  if(p.table==='CarAudioComponent'&&scope.versions.has(r?.versionId))scope.components.add(r.id);
  if(p.table==='CarConfigurationVersion'&&scope.versions.has(r?.id))
   scope.configurations.add(r.configurationId);
  if(p.table==='CarConfiguration'&&scope.configurations.has(r?.id))
   scope.cars.add(r.carId);
 }
 return scope;
}
function validateSnapshot(snapshot,options){
 if(snapshot?.format!==2||snapshot.journalCoverage?.fromSequence!==0
  ||JSON.stringify(snapshot.journalCoverage?.tables)!==JSON.stringify(FULL_RETURN_COVERAGE_TABLES))
  reject('MANUAL: insufficient signed journal coverage for full import');
 if(!UUID.test(options.stageId??'')||snapshot?.stageId!==options.stageId
  ||!SHA.test(options.baselineSha256??'')
  ||snapshot.baselineSha256!==options.baselineSha256
  ||!Array.isArray(snapshot.events)||snapshot.events.length>25000)
  reject('untrusted stage or baseline');
 let prev='0'.repeat(64),seq=0;
 for(const event of snapshot.events){
  if(!plain(event)||!Number.isSafeInteger(event.sequence)||event.sequence<=seq
   ||!SHA.test(event.hash??'')||event.previousHash!==prev
   ||!plain(event.payload)||event.payload.sequence!==event.sequence
   ||event.payload.stageId!==options.stageId
   ||!UUID.test(event.payload.recordId??''))
   reject('journal chain or event identity');
  const p=event.payload;
  if(!RETURN_COLUMNS[p.table])reject('MANUAL: unsupported domain '+p.table);
  if(!['INSERT','UPDATE','DELETE'].includes(p.operation))reject('unknown operation');
  if(p.operation==='INSERT'&&p.before!==null||
   p.operation==='DELETE'&&p.after!==null||
   p.operation==='UPDATE'&&(!p.before||!p.after))reject('operation shape');
  for(const row of [p.before,p.after]){
   if(row===null)continue;
   if(!plain(row)||row.id!==p.recordId)reject('record identity mismatch');
   normalize(p.table,row);
  }
  if(p.table==='Participant'){
   const consentKeys=['publicationConsent','publicationConsentAt','publicationConsentVersion','publicationRestrictions'];
   if(p.operation==='INSERT'&&consentKeys.some(key=>p.after[key]!==null&&p.after[key]!==undefined) ||
      p.operation==='UPDATE'&&consentKeys.some(key=>!same(p.after[key],p.before[key])))
     reject('consent must be recorded centrally, never changed through offline stage journal');
  }
  if(p.table==='Participant'||p.table==='Car'){
   if(p.operation==='INSERT'&&p.after.photoUrl
    ||p.operation==='UPDATE'&&p.after.photoUrl!==p.before.photoUrl)
    reject('MEDIA: offline photo changes are unsupported; preserve venue database for manual review');
  }
  if(p.table==='Registration'&&(p.after??p.before).stageId!==options.stageId)
   reject('foreign stage registration');
  if(p.operation==='DELETE'&&CASCADE_PROTECTED.has(p.table))
   reject('MANUAL: destructive profile/configuration deletion');
  prev=event.hash;seq=event.sequence;
 }
 if(snapshot.journalEndHash!==prev||snapshot.events.length!==snapshot.eventCount
  &&snapshot.eventCount!==undefined)reject('incomplete journal');
}

function remapRow(table,row,people,cars){
 if(!row)return row;
 const result={...row};
 if(['Car','Registration','ParticipantStageInspection'].includes(table)&&result.participantId)
  result.participantId=people.get(result.participantId)??result.participantId;
 if(['Registration','CarConfiguration'].includes(table)&&result.carId)
  result.carId=cars.get(result.carId)??result.carId;
 return result;
}
function reviewApproval(resolutions,table,sourceId,candidates,apply,reviewId,approvedBy,reasonCode){
 const key=conflictKey(table,sourceId),decision=resolutions[key]??null;
 const ids=candidates.map(x=>x.id).sort();
 if(!ids.length){
  if(decision)reject('MANUAL_REVIEW: stale ADMIN decision without central conflict '+key);
  return null;
 }
 if(!decision)reject('MANUAL_REVIEW: '+(reasonCode??(table==='Participant'?'DUPLICATE_PARTICIPANT_NAME':'DUPLICATE_CAR_PLATE'))+' '+sourceId);
 if(decision.key!==key||decision.table!==table||decision.sourceId!==sourceId
  ||!['LINK','NEW','DEFER'].includes(decision.action)
  ||!Array.isArray(decision.candidateIds)||JSON.stringify([...decision.candidateIds].sort())!==JSON.stringify(ids)
  ||typeof decision.reason!=='string'||decision.reason.length<10||decision.reason.length>600)
  reject('MANUAL_REVIEW: stale, altered or incomplete resolution '+key);
 if(decision.action==='DEFER')reject('MANUAL_REVIEW: deferred '+key);
 if(decision.action==='NEW'){
  if(decision.targetId!==null||decision.reason.length<12)
   reject('MANUAL_REVIEW: NEW requires verified namesake declaration '+key);
 }else if(!UUID.test(decision.targetId??'')||!ids.includes(decision.targetId))
  reject('MANUAL_REVIEW: selected target is not a verified candidate '+key);
 if(apply&&(!UUID.test(reviewId??'')||!UUID.test(approvedBy??'')))
  reject('MANUAL_REVIEW: audited ADMIN approval required');
 return decision;
}

/** Exact, all-or-none import. Dry-run does not write receipts or domain rows. */
export async function applyCompleteVenueJournal(snapshot,adapter,options={}){
 validateSnapshot(snapshot,options);
 const {stageId,baselineSha256,apply=false,operator='',resolutions={},reviewId=null,approvedBy=null}=options;
 if(!resolutions||typeof resolutions!=='object'||Array.isArray(resolutions)
  ||Object.keys(resolutions).length>2500)
  reject('MANUAL_REVIEW: invalid approved decisions');
 const resolutionHash=venueResolutionHash(Object.values(resolutions));
 if(resolutionHash&&apply&&(!UUID.test(reviewId??'')||!UUID.test(approvedBy??'')))
  reject('MANUAL_REVIEW: missing authenticated ADMIN approval');
 const allowedIds=new Set(snapshot.events.filter(e=>e.payload.operation==='INSERT'
  &&['Participant','Car'].includes(e.payload.table))
  .map(e=>conflictKey(e.payload.table,e.payload.recordId)));
 if(Object.keys(resolutions).some(key=>!allowedIds.has(key)))
  reject('MANUAL_REVIEW: forged decision for unrelated event');
 if(apply&&(typeof operator!=='string'||operator.trim().length<3||operator.length>120))
  reject('operator confirmation required');
 return adapter.transaction(async tx=>{
  const stage=await tx.stage(stageId);
  if(!stage||stage.isDeleted||!['PUBLISHED','COMPLETED'].includes(stage.status))
   reject('central stage missing or inactive');
  const previous=await tx.listReceipts(stageId);
  const list=previous.filter(r=>r.action==='VENUE_FULL_EVENT_IMPORTED');
  if(list.length){
   if(list.length!==snapshot.events.length
     ||resolutionHash&&list.some(r=>r.resolutionHash!==resolutionHash)
     ||!resolutionHash&&list.some(r=>r.resolutionHash)
     ||snapshot.events.some(e=>!list.some(r=>r.eventHash===e.hash
       &&r.sequence===e.sequence&&r.baselineSha256===baselineSha256
       &&r.journalEndHash===snapshot.journalEndHash)))
    reject('partial, unknown or different journal receipts');
   // Audit receipts alone do not prove the current DB still matches the
   // signed event. Admins may have changed or deleted rows after import.
   // Inspect FINAL states (not intermediate UPDATEs), with one exception:
   // rank and best flags are derived centrally and may legitimately change.
   const finalStates=new Map();
   const replayPeople=new Map(),replayCars=new Map();
   for(const decision of Object.values(resolutions)){
    if(decision.action==='LINK')
     (decision.table==='Participant'?replayPeople:replayCars).set(decision.sourceId,decision.targetId);
   }
   for(const event of snapshot.events){
    const p=event.payload;
    finalStates.set(p.table+':'+p.recordId,{table:p.table,id:p.recordId,after:p.after});
   }
   for(const {table,id,after} of finalStates.values()){
    const linked=(table==='Participant'?replayPeople:replayCars).get(id);
    if(linked){
     const target=await tx.getRow(table,linked);
     if(target===null)reject('CENTRAL_CHANGED: approved target disappeared '+table);
     if(table==='Car'&&replayPeople.has(after?.participantId)
       &&target.participantId!==replayPeople.get(after.participantId))
      reject('CENTRAL_CHANGED: approved car ownership changed');
     continue;
    }
    const actual=await tx.getRow(table,id);
    if(after===null){
     if(actual!==null)reject('CENTRAL_CHANGED: deleted signed row restored '+table);
     continue;
    }
    if(actual===null)reject('CENTRAL_CHANGED: signed row disappeared '+table);
    const signed=await tx.canonical(table,remapRow(table,normalize(table,after),replayPeople,replayCars));
    const current=await tx.canonical(table,actual);
    if(!sameSignedStageState(table,signed,current))
     reject('CENTRAL_CHANGED: signed row modified '+table);
   }
   return {stageId,databaseSynchronized:true,alreadyApplied:true,
    appliedEvents:0,readyEvents:0,totalEvents:snapshot.events.length,
    journalEndHash:snapshot.journalEndHash,mediaSynchronized:false,mediaTransferRequired:false};
  }
  if(stage.resultsPublishedAt)reject('central results are published');
  const original=await tx.linkedIds(stageId);
  const scope=buildScope(snapshot,original);
  // A new car for an unregistered competitor must have an existing central
  // owner or a signed Participant INSERT, never a fabricated orphan identity.
  for(const event of snapshot.events){
   const p=event.payload;
   if(p.table!=='Car'||p.operation!=='INSERT')continue;
   const owner=p.after.participantId;
   if(scope.newPeople.has(owner)||scope.registeredPeople.has(owner))continue;
   if(!await tx.getRow('Participant',owner))
    reject('MANUAL_REVIEW: unregistered car owner is missing centrally');
  }
  for(const e of snapshot.events)stageRefs(e,scope);
  let readyEvents=0;
  const newOfflinePeople=[],newOfflineCars=[];
  const linkedPeople=new Map(),linkedCars=new Map(),approvedKeys=new Set();
  const signedCarsByOwner=new Map();
  for(const signedEvent of snapshot.events){
   if(signedEvent.payload.table==='Car'&&signedEvent.payload.operation==='INSERT'){
    const car=signedEvent.payload.after;
    const rows=signedCarsByOwner.get(car.participantId)??[];
    rows.push(car);signedCarsByOwner.set(car.participantId,rows);
   }
  }
  for(const event of snapshot.events){
   const p=event.payload,table=p.table;
   if(p.operation!=='INSERT'
    &&((table==='Participant'&&linkedPeople.has(p.recordId))
      ||(table==='Car'&&linkedCars.has(p.recordId))))
    reject('MANUAL_REVIEW: cannot overwrite linked central identity');
   const before=remapRow(table,p.before&&normalize(table,p.before),linkedPeople,linkedCars);
   let after=remapRow(table,p.after&&normalize(table,p.after),linkedPeople,linkedCars);
   const actual=await tx.getRow(table,p.recordId);
   let effectiveKind=p.operation;
   let skipLinkedInsert=false;
   if(p.operation==='INSERT'){
    if(actual!==null)reject('duplicate central ID '+table+' '+p.recordId);
    // A result or inspection created on the LAN may have a different UUID
    // than an online provisional entry for the SAME stage slot. Keep the
    // original in an audit entry and replace it inside this one transaction.
    if(UNIQUE_STAGE_SLOTS.has(table)){
     const displaced=await tx.findStageSlot(table,after,stageId);
     if(displaced){
      if(typeof tx.auditOverride!=='function'||typeof tx.removeStageSlot!=='function')
       reject('MANUAL_REVIEW: central slot replacement requires audited adapter');
      if(apply)await tx.auditOverride({
       stageId,eventHash:event.hash,operator,table,recordId:p.recordId,
       reason:'OFFLINE_STAGE_SLOT_REPLACED',before:displaced,after,
      });
      await tx.removeStageSlot(table,displaced,stageId);
     }
    }
    if(table==='Participant'){
     if(typeof tx.participantIdentityCandidates!=='function')
      reject('MANUAL_REVIEW: central identity lookup unavailable');
     const matches=await tx.participantIdentityCandidates(after);
     if(!Array.isArray(matches))
      reject('MANUAL_REVIEW: central identity lookup unavailable');
     const offlineCars=signedCarsByOwner.get(after.id)??[];
     const centralCars=offlineCars.length&&typeof tx.carPlateCandidates==='function'
      ?await tx.carPlateCandidates(offlineCars[0]):[];
     const candidates=participantReviewCandidates(after,matches,centralCars,offlineCars);
     if(newOfflinePeople.some(candidate=>candidate.id!==after.id&&participantNamesNeedReview(after,candidate)))
      reject('MANUAL_REVIEW: duplicate profiles within signed journal');
     const reasonCode=candidates.some(candidate=>participantNamesNeedReview(after,candidate))
      ?'DUPLICATE_PARTICIPANT_NAME':'DUPLICATE_PARTICIPANT_BY_PLATE';
     const choice=reviewApproval(resolutions,'Participant',after.id,candidates,apply,reviewId,approvedBy,reasonCode);
     if(choice){
      approvedKeys.add(choice.key);
      if(choice.action==='LINK'){linkedPeople.set(after.id,choice.targetId);skipLinkedInsert=true;}
     }
     newOfflinePeople.push(after);
    }
    if(table==='Car'){
     if(typeof tx.carPlateCandidates!=='function')
      reject('MANUAL_REVIEW: central plate lookup unavailable');
     const matches=await tx.carPlateCandidates(after);
     if(!Array.isArray(matches))
      reject('MANUAL_REVIEW: central plate lookup unavailable');
     const plate=canonicalVehiclePlate(after);
     const candidates=matches.filter(existing=>existing.id!==after.id
      &&plate&&canonicalVehiclePlate(existing)===plate);
     if(newOfflineCars.some(existing=>existing.id!==after.id&&plate
       &&canonicalVehiclePlate(existing)===plate))
      reject('MANUAL_REVIEW: duplicate cars within signed journal');
     const choice=reviewApproval(resolutions,'Car',after.id,candidates,apply,reviewId,approvedBy);
     if(choice){
      approvedKeys.add(choice.key);
      if(choice.action==='LINK'){
       const target=candidates.find(x=>x.id===choice.targetId);
       const linkedOwner=linkedPeople.get(after.participantId)??after.participantId;
       if(target.participantId!==linkedOwner)
        reject('MANUAL_REVIEW: existing car belongs to another participant');
       linkedCars.set(after.id,choice.targetId);skipLinkedInsert=true;
      }
     }
     newOfflineCars.push(after);
    }
   }else{
    if(actual===null){
     if(!STAGE_WINNERS.has(table))
      reject('missing central row '+table+' '+p.recordId);
     // The signed local edit restores an online-deleted stage row. A locally
     // deleted row already absent centrally needs only its signed receipt.
     effectiveKind=p.operation==='UPDATE'?'INSERT':'NOOP';
    }else{
     const left=await tx.canonical(table,actual);
     const right=await tx.canonical(table,before);
     if(!same(left,right)){
      if(!STAGE_WINNERS.has(table))
       reject('central changed '+table+' '+p.recordId);
      if(typeof tx.auditOverride!=='function')
       reject('MANUAL_REVIEW: stage conflict cannot be imported without audit');
      if(apply)await tx.auditOverride({
       stageId,eventHash:event.hash,operator,table,recordId:p.recordId,
       reason:'OFFLINE_STAGE_PREVAILS',before:left,after,
      });
     }
     if(STAGE_WINNERS.has(table)){
      const protectedRow=stageWinnerRow(table,actual,after??before,stageId);
      if(p.operation!=='DELETE')after=protectedRow;
     }
    }
   }
   if(p.table==='Registration'&&p.operation!=='DELETE'&&after.status==='ACTIVE'
    &&!await tx.participantEligible(after.participantId,stageId))
    reject('DISQUALIFIED central participant');
   if(p.table==='RegistrationClass'&&p.operation!=='DELETE'
    &&!await tx.stageClassAllowed(stageId,after.classId))
    reject('class not active on this stage');
   if(p.table==='Result'&&p.operation!=='DELETE'
    &&!await tx.resultAdmission(after,stageId))
    reject('result without central inspection and class admission');
   if(p.table==='RegistrationNumber'&&p.operation!=='DELETE'){
    const number=await tx.numberOwner(stageId,after.number);
    if(number&&number.id!==p.recordId)reject('номер занят: '+after.number);
   }
   // Dry-run exercises actual FK/UNIQUE checks before rolling back atomically.
   if(!skipLinkedInsert&&effectiveKind!=='NOOP')
    await tx.write(table,{kind:effectiveKind,eventSequence:event.sequence},after,actual??before);
   const choice=resolutions[conflictKey(table,p.recordId)];
   if(choice&&apply){
    if(typeof tx.auditResolution!=='function')
     reject('MANUAL_REVIEW: missing transactional approval audit');
    await tx.auditResolution({stageId,journalEndHash:snapshot.journalEndHash,
     reviewId,approvedBy,table,sourceId:p.recordId,action:choice.action,
     targetId:choice.targetId,reason:choice.reason,resolutionHash});
   }
   if(apply){
    await tx.receipt({
     action:'VENUE_FULL_EVENT_IMPORTED',stageId,eventHash:event.hash,
     sequence:event.sequence,operation:p.operation,journalEndHash:snapshot.journalEndHash,
     baselineSha256,entity:table,entityId:p.recordId,operator,resolutionHash,
    });
   }
   readyEvents++;
  }
  if(approvedKeys.size!==Object.keys(resolutions).length)
   reject('MANUAL_REVIEW: unused or stale approvals');
  return {stageId,databaseSynchronized:Boolean(apply),
   alreadyApplied:false,appliedEvents:apply?readyEvents:0,
   readyEvents:apply?0:readyEvents,totalEvents:snapshot.events.length,
   journalEndHash:snapshot.journalEndHash,mediaSynchronized:false,mediaTransferRequired:false,
   published:false,notice:'Offline photo uploads are disabled; no media transfer for photo-free stage; field acceptance is separate'};
 },{readOnly:!apply});
}
