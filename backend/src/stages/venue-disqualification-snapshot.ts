import {ServiceUnavailableException} from '@nestjs/common';

/** Signed at the central server, stored by the root-only stage importer.
 * This snapshot is admission evidence, NOT a new local disciplinary record:
 * no User FK, journal trigger, invented issuer or extra personal data.
 */
export type SignedVenueDisqualification={
 id:string;participantId:string;scope:'FORMAT'|'SEASON'|'STAGE';
 stageId:string|null;seasonId:string|null;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const refuse=()=>new ServiceUnavailableException(
 'Список дисквалификаций площадки не подтверждён. Скачайте новый подписанный пакет этапа онлайн.');
const valid=(record:any,stageId:string,seasonId:string)=>{
 if(!record||typeof record!=='object'||Array.isArray(record)
  ||Object.keys(record).length!==5
  ||['id','participantId','scope','stageId','seasonId'].some(key=>!Object.hasOwn(record,key))
  ||!uuid.test(record.id??'')||!uuid.test(record.participantId??''))
  return false;
 if(record.scope==='FORMAT')return record.stageId===null&&record.seasonId===null;
 if(record.scope==='SEASON')return record.stageId===null&&record.seasonId===seasonId;
 if(record.scope==='STAGE')return record.stageId===stageId&&record.seasonId===null;
 return false;
};
export async function readSignedVenueDisqualifications(
 tx:any,participantId:string,stageId:string,seasonId:string,
):Promise<SignedVenueDisqualification[]>{
 const setting=await tx.siteSettings.findUnique({
  where:{id:'default'},select:{registration:true},
 });
 const entry=setting?.registration?.venueDisqualificationSnapshot;
 if(!entry||typeof entry!=='object'||Array.isArray(entry)
  ||entry.stageId!==stageId||!uuid.test(stageId)||!uuid.test(seasonId)
  ||!Array.isArray(entry.records)||entry.records.length>25000
  ||typeof entry.generatedAt!=='string')throw refuse();
 const created=Date.parse(entry.generatedAt);
 // A package is valid for 72 hours; never interpret absent/stale bans as none.
 if(!Number.isFinite(created)||created>Date.now()+300000
  ||Date.now()-created>72*60*60*1000)throw refuse();
 const ids=new Set<string>();
 for(const record of entry.records){
  if(!valid(record,stageId,seasonId)||ids.has(record.id))throw refuse();
  ids.add(record.id);
 }
 return entry.records.filter((record:SignedVenueDisqualification)=>record.participantId===participantId);
}
