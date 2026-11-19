import {createHash} from 'node:crypto';

/** No untrusted input may change a signed journal. This module computes a
 * review proposal from verified, decrypted events and fresh CENTRAL identities.
 * Only the ADMIN decision IDs/reasons are stored; the encrypted packet stays on
 * the laptop, and the original journal must be submitted again after review. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
export const conflictKey=(table,id)=>table+':'+id;
const clean=s=>String(s??'').normalize('NFKC').replace(/\s+/gu,' ').trim();
const part=s=>clean(s).toLocaleLowerCase('ru-RU').replace(/ё/g,'е');

export function participantNamesNeedReview(candidate,existing){
 const first=part(candidate?.firstName),last=part(candidate?.lastName);
 if(!first||!last||first!==part(existing?.firstName)||last!==part(existing?.lastName))return false;
 const middle=part(candidate?.middleName),other=part(existing?.middleName);
 return !middle||!other||middle===other;
}
export function canonicalVehiclePlate(car){
 if(!car?.registrationCountry||!car?.registrationNumber)return '';
 const country=String(car.registrationCountry);
 let value=clean(car.registrationNumber).toLocaleUpperCase('ru-RU')
  .replace(/[\u200B-\u200D\uFEFF]/g,'');
 if(country==='RU'){
  const russian={A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
  value=[...value].map(char=>russian[char]??char).join('');
 }
 return country+':'+value.replace(/[^\p{L}\p{N}]/gu,'');
}
const label=p=>[p.lastName,p.firstName,p.middleName].map(clean).filter(Boolean).join(' ');
export function collectVenueReturnConflicts(snapshot,{participants=[],cars=[]}={}){
 if(!snapshot||!UUID.test(snapshot.stageId??'')||!SHA.test(snapshot.journalEndHash??'')
  ||!Array.isArray(snapshot.events)||snapshot.events.length>25000
  ||!Array.isArray(participants)||!Array.isArray(cars))
  throw Error('UNTRUSTED VENUE REVIEW');
 const conflicts=[],seen=new Set(),newPeople=[],newCars=[];
 for(const event of snapshot.events){
  const p=event?.payload,row=p?.after;
  if(p?.operation!=='INSERT'||!['Participant','Car'].includes(p?.table))continue;
  if(!row||row.id!==p.recordId||!UUID.test(row.id)||seen.has(conflictKey(p.table,row.id)))
   throw Error('UNTRUSTED VENUE REVIEW RECORD');
  const key=conflictKey(p.table,row.id);seen.add(key);
  const candidates=(p.table==='Participant'?participants:cars).filter(target=>
    target.id!==row.id&&(p.table==='Participant'?participantNamesNeedReview(row,target):
     canonicalVehiclePlate(row)!==''&&canonicalVehiclePlate(row)===canonicalVehiclePlate(target)));
  // Two new offline identities with same data cannot be resolved against a
  // pre-existing central ID safely. Refuse pending separate identity audit.
  const local=(p.table==='Participant'?newPeople:newCars);
  if(local.some(other=>p.table==='Participant'?participantNamesNeedReview(row,other):
    canonicalVehiclePlate(row)!==''&&canonicalVehiclePlate(row)===canonicalVehiclePlate(other)))
   throw Error('MANUAL_REVIEW: duplicate identities already inside the signed venue journal');
  local.push(row);
  if(!candidates.length)continue;
  conflicts.push({
   key,table:p.table,sourceId:row.id,source:p.table==='Participant'
    ?{name:label(row),city:clean(row.city),id:row.id}
    :{plate:clean(row.registrationNumber),country:row.registrationCountry,
      brand:clean(row.brand),model:clean(row.model),participantId:row.participantId,id:row.id},
   candidates:candidates.map(target=>p.table==='Participant'
    ?{id:target.id,name:label(target),city:clean(target.city)}
    :{id:target.id,plate:clean(target.registrationNumber),
      country:target.registrationCountry,brand:clean(target.brand),
      model:clean(target.model),participantId:target.participantId}).sort((a,b)=>a.id.localeCompare(b.id)),
  });
 }
 return conflicts.sort((a,b)=>a.key.localeCompare(b.key));
}
export function validateVenueReviewDecisions(conflicts,decisions){
 if(!Array.isArray(conflicts)||conflicts.length>2500||!Array.isArray(decisions)
  ||decisions.length!==conflicts.length)throw Error('VENUE REVIEW: all conflicts require explicit decisions');
 const known=new Map(conflicts.map(x=>[x.key,x]));const used=new Set();
 return decisions.map(input=>{
  if(!input||typeof input!=='object'||Array.isArray(input)
    ||Object.keys(input).some(k=>!['key','action','targetId','reason'].includes(k))
    ||typeof input.key!=='string'||!known.has(input.key)||used.has(input.key)
    ||!['LINK','NEW','DEFER'].includes(input.action)
    ||typeof input.reason!=='string'||input.reason.length>600)
   throw Error('VENUE REVIEW: invalid or repeated decision');
  used.add(input.key);
  const conflict=known.get(input.key);
  const reason=clean(input.reason);
  if(input.action==='LINK'){
   if(!UUID.test(input.targetId??'')||!conflict.candidates.some(c=>c.id===input.targetId)
    ||reason.length<10)throw Error('VENUE REVIEW: target is not among verified candidates');
  }else if(input.action==='NEW'){
   if(input.targetId!==null&&input.targetId!==undefined||reason.length<12)
    throw Error('VENUE REVIEW: explain why matching identities are distinct');
  }else if(input.targetId!==null&&input.targetId!==undefined)
   throw Error('VENUE REVIEW: DEFER cannot change an identity');
  return {key:input.key,table:conflict.table,sourceId:conflict.sourceId,
   action:input.action,targetId:input.action==='LINK'?input.targetId:null,
   candidateIds:conflict.candidates.map(c=>c.id).sort(),reason};
 }).sort((a,b)=>a.key.localeCompare(b.key));
}
export function venueResolutionHash(decisions){
 if(!Array.isArray(decisions)||!decisions.length)return null;
 return createHash('sha256').update(JSON.stringify([...decisions].sort((a,b)=>a.key.localeCompare(b.key)))).digest('hex');
}
export function venueResolutionMap(decisions){
 return Object.fromEntries(decisions.map(x=>[x.key,x]));
}
