import {createHash} from 'node:crypto';
import {FULL_RETURN_COVERAGE_TABLES} from './venue-return-package.mjs';
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
 Participant:'id usdIdToken team phone photoUrl isPublic legacyId historicalAlias createdAt updatedAt birthDate city firstName lastName middleName',
 Car:'id participantId brand model photoUrl isActive legacyId createdAt updatedAt registrationNumber registrationCountry color isPublic',
 CarConfiguration:'id carId name isActive currentVersion createdAt updatedAt',
 CarConfigurationVersion:'id version vibrationIsolation additionalDescription createdAt configurationId',
 CarAmplifier:'id versionId brand catalogEntryId model quantity direction',
 CarAudioComponent:'id versionId brand catalogEntryId model quantity type direction',
 CarBattery:'id versionId brand model quantity',
 CarGenerator:'id versionId brand model quantity',
 CarHeadUnit:'id versionId brand catalogEntryId model direction',
 CarAmplifierComponent:'id amplifierId componentId quantity',
 Registration:'id stageId participantId carId configurationVersionId configurationSnapshot participantNumber teamIdAtInspection teamNameAtInspection teamAffiliationCapturedAt rulesAcceptedAt rulesVersion privacyConsentAt privacyConsentVersion termsAcceptedAt termsVersion consentCapturedByUserId source status registeredAt legacyId participantStageInspectionId',
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
  reject('participant without this stage registration');
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
  configurations:new Set(original.configurations??[]),
  versions:new Set(original.versions??[]),
  classes:new Set(original.classes??[]),
  amplifiers:new Set(original.amplifiers??[]),
  components:new Set(original.components??[]),
 };
 for(const e of snapshot.events){
  const p=e.payload,r=p.after??p.before;
  if(p.table==='Registration'&&r?.stageId===scope.stageId){
   scope.registrations.add(r.id);
   scope.participants.add(r.participantId);
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
  if(p.table==='Participant'||p.table==='Car'){
   if(p.operation==='INSERT'&&p.after.photoUrl
    ||p.operation==='UPDATE'&&p.after.photoUrl!==p.before.photoUrl
      &&p.after.photoUrl!==null)
    reject('MEDIA: import actual image blobs before changing photo URLs');
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

/** Exact, all-or-none import. Dry-run does not write receipts or domain rows. */
export async function applyCompleteVenueJournal(snapshot,adapter,options={}){
 validateSnapshot(snapshot,options);
 const {stageId,baselineSha256,apply=false,operator=''}=options;
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
     ||snapshot.events.some(e=>!list.some(r=>r.eventHash===e.hash
       &&r.sequence===e.sequence&&r.baselineSha256===baselineSha256
       &&r.journalEndHash===snapshot.journalEndHash)))
    reject('partial, unknown or different journal receipts');
   return {stageId,databaseSynchronized:true,alreadyApplied:true,
    appliedEvents:0,readyEvents:0,totalEvents:snapshot.events.length,
    journalEndHash:snapshot.journalEndHash,mediaSynchronized:false};
  }
  if(stage.resultsPublishedAt)reject('central results are published');
  const original=await tx.linkedIds(stageId);
  const scope=buildScope(snapshot,original);
  for(const e of snapshot.events)stageRefs(e,scope);
  let readyEvents=0;
  for(const event of snapshot.events){
   const p=event.payload,table=p.table;
   const before=p.before&&normalize(table,p.before);
   const after=p.after&&normalize(table,p.after);
   const actual=await tx.getRow(table,p.recordId);
   if(p.operation==='INSERT'){
    if(actual!==null)reject('duplicate central ID '+table+' '+p.recordId);
   }else{
    if(actual===null)reject('missing central row '+table+' '+p.recordId);
    const left=await tx.canonical(table,actual);
    const right=await tx.canonical(table,before);
    if(!same(left,right))reject('central changed '+table+' '+p.recordId);
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
   if(apply){
    await tx.write(table,{kind:p.operation,eventSequence:event.sequence},after,before);
    await tx.receipt({
     action:'VENUE_FULL_EVENT_IMPORTED',stageId,eventHash:event.hash,
     sequence:event.sequence,journalEndHash:snapshot.journalEndHash,
     baselineSha256,entity:table,entityId:p.recordId,operator,
    });
   }
   readyEvents++;
  }
  return {stageId,databaseSynchronized:Boolean(apply),
   alreadyApplied:false,appliedEvents:apply?readyEvents:0,
   readyEvents:apply?0:readyEvents,totalEvents:snapshot.events.length,
   journalEndHash:snapshot.journalEndHash,mediaSynchronized:false,
   published:false,notice:'No media object transfer or final field acceptance is claimed'};
 },{readOnly:!apply});
}
