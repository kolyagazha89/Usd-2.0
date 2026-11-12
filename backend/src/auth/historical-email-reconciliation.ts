import type { NameNormalizerService } from '../common/names/name-normalizer.service';

export type HistoricalPerson = {id:string;firstName:string;lastName:string;middleName:string|null;legacyEmail:string|null;appearances:{stageId:string;participantNumber:number}[]};
export type HistoricalEmailRow = {stageId:string;name:string;email:string;participantNumber:number|null};
export type ReconciliationCandidate = {participantId:string;email:string};
const cleanEmail=(s:string)=>s.normalize('NFKC').trim().toLowerCase();
export const normalizedSourceEmail=(s:string):string|null=>{const v=cleanEmail(s);return v.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)?v:null};
const nameTokens=(s:string,normalizer:NameNormalizerService)=>normalizer.toLatin(normalizer.normalize(s)).toLowerCase().split(/\s+/).filter(Boolean).sort();
const patronymic=(token:string)=>/(?:ovich|evich|ovna|evna|ichna)$/.test(token);
export function sameHistoricalFullName(a:string,b:string,normalizer:NameNormalizerService):boolean{
 const left=nameTokens(a,normalizer),right=nameTokens(b,normalizer);
 if(left.length<2||right.length<2||left.length>3||right.length>3)return false;
 if(left.length===right.length)return left.every((t,i)=>t===right[i]);
 const short=left.length===2?left:right,long=left.length===3?left:right;
 return short.every(t=>long.includes(t))&&long.some(t=>!short.includes(t)&&patronymic(t));
}
/** A name alone is never a permission to claim someone's historical email. */
export function reconcileHistoricalEmails(people:HistoricalPerson[],rows:HistoricalEmailRow[],normalizer:NameNormalizerService,mergedEmails:ReconciliationCandidate[]=[]){
 const stageIndex=new Map<string,HistoricalPerson[]>();
 for(const p of people)for(const reg of p.appearances){const all=stageIndex.get(reg.stageId)??[];if(!all.some(x=>x.id===p.id))all.push(p);stageIndex.set(reg.stageId,all)}
 const found=new Map<string,Set<string>>();
 const append=(id:string,email:string)=>{const set=found.get(id)??new Set<string>();set.add(email);found.set(id,set)};
 for(const entry of mergedEmails){const email=normalizedSourceEmail(entry.email);if(email&&people.some(p=>p.id===entry.participantId))append(entry.participantId,email)}
 let rowsWithEmail=0,invalidEmailRows=0,unmatchedRows=0,ambiguousRows=0,matchedRows=0;
 for(const row of rows){if(!row.email?.trim())continue;rowsWithEmail++;
  const email=normalizedSourceEmail(row.email);if(!email){invalidEmailRows++;continue}
  let matches=(stageIndex.get(row.stageId)??[]).filter(p=>sameHistoricalFullName(row.name,[p.lastName,p.firstName,p.middleName].filter(Boolean).join(' '),normalizer));
  if(matches.length>1&&row.participantNumber!==null){const exact=matches.filter(p=>p.appearances.some(r=>r.stageId===row.stageId&&r.participantNumber===row.participantNumber));if(exact.length===1)matches=exact}
  if(!matches.length){unmatchedRows++;continue}if(matches.length>1){ambiguousRows++;continue}
  matchedRows++;append(matches[0].id,email);
 }
 const owners=new Map<string,Set<string>>();const addOwner=(email:string,id:string)=>{const set=owners.get(email)??new Set<string>();set.add(id);owners.set(email,set)};
 for(const p of people){const saved=normalizedSourceEmail(p.legacyEmail??'');if(saved)addOwner(saved,p.id);for(const email of found.get(p.id)??[])addOwner(email,p.id)}
 const candidates:ReconciliationCandidate[]=[];let conflictingProfiles=0,alreadyCovered=0;
 for(const p of people){const source=found.get(p.id);if(!source?.size)continue;
  const saved=normalizedSourceEmail(p.legacyEmail??'');
  if(source.size!==1||[...source].some(email=>(owners.get(email)?.size??0)>1)||(saved&&!source.has(saved))){conflictingProfiles++;continue}
  if(saved){alreadyCovered++;continue}
  candidates.push({participantId:p.id,email:[...source][0]});
 }
 candidates.sort((a,b)=>a.participantId.localeCompare(b.participantId));
 return {candidates,summary:{sourceRows:rows.length,rowsWithEmail,invalidEmailRows,unmatchedRows,ambiguousRows,matchedRows,safeProfiles:candidates.length,conflictingProfiles,alreadyCovered}};
}
