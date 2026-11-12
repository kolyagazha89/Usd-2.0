#!/usr/bin/env node
/** Trusted central Ubuntu operator only. Never run against the venue DB. */
import {readFile,stat} from 'node:fs/promises';
import {createHash,createPublicKey} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {openVenueReturn} from '../../deploy/venue-lan/venue-return-package.mjs';
import {applyVenueReturnSnapshot} from '../../deploy/venue-lan/central-return-apply.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
async function safeRead(file,limit){
 const info=await stat(file);
 if(!info.isFile()||info.size>limit||info.size<1)throw Error('Недопустимый файл возврата');
 return readFile(file,'utf8');
}
async function readPassphrase(){
 let value='';
 for await(const chunk of process.stdin){
  value+=chunk.toString('utf8');
  if(value.length>4096)throw Error('Слишком длинная фраза');
 }
 return value.replace(/\r?\n$/,'');
}
export function postgresVenueAdapter(client){
 return {
  async transaction(callback,{readOnly=false}={}){
   await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
   try{
    await client.query("SET LOCAL statement_timeout = '25000ms'");
    const tx={
     async stage(id){
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
      const {rows}=await client.query(
       'SELECT id,status,"isDeleted","resultsPublishedAt" FROM "Stage" WHERE id=$1 FOR UPDATE',[id]);
      return rows[0]??null;
     },
     async result(id,classId){
      const {rows}=await client.query(
       'SELECT id,"registrationId","registrationClassId",value::text AS value,unit,place,"isBest",notes,"isHistorical","verificationStatus" FROM "Result" WHERE id=$1 OR "registrationClassId"=$2 FOR UPDATE',
       [id,classId]);
      return {byId:rows.find(r=>r.id===id),byClass:rows.find(r=>r.registrationClassId===classId)};
     },
     async receipt(stageId,eventHash){
      const {rows}=await client.query(
       "SELECT id FROM \"AuditLog\" WHERE action IN ('VENUE_RESULT_IMPORTED','VENUE_STAGE_INSPECTION_IMPORTED') AND metadata->>'stageId'=$1 AND metadata->>'eventHash'=$2 LIMIT 1",
       [stageId,eventHash]);
      return rows[0]??null;
     },
     async context(registrationId,registrationClassId,stageId){
      const {rows}=await client.query(
       'SELECT r."stageId" AS "stageId",r.status AS "registrationStatus",rc.id AS "classId",c.unit AS unit,COALESCE(ps.status,i.status) AS "inspectionStatus" FROM "Registration" r JOIN "RegistrationClass" rc ON rc."registrationId"=r.id JOIN "Class" c ON c.id=rc."classId" AND c."isActive"=true JOIN "StageClass" sc ON sc."stageId"=r."stageId" AND sc."classId"=rc."classId" AND sc."isActive"=true JOIN "Stage" st ON st.id=r."stageId" LEFT JOIN "ParticipantStageInspection" ps ON ps."participantId"=r."participantId" AND ps."stageId"=r."stageId" LEFT JOIN "Inspection" i ON i."registrationId"=r.id WHERE r.id=$1 AND rc.id=$2 AND r."stageId"=$3 AND NOT EXISTS (SELECT 1 FROM "Disqualification" d WHERE d."participantId"=r."participantId" AND d.status=$4 AND (d.scope=$5 OR (d.scope=$6 AND d."seasonId"=st."seasonId") OR (d.scope=$7 AND d."stageId"=r."stageId")))',
       [registrationId,registrationClassId,stageId,"ACTIVE","FORMAT","SEASON","STAGE"]);
      return rows[0]??null;
     },
     async stageInspection(id,participantId,stageId){
      const {rows}=await client.query(
       'SELECT id,"participantId","stageId",status,notes,"checkedByName","checkedAt" FROM "ParticipantStageInspection" WHERE id=$1 OR ("participantId"=$2 AND "stageId"=$3) FOR UPDATE',
       [id,participantId,stageId]);
      return {byId:rows.find(r=>r.id===id),
       byParticipant:rows.find(r=>r.participantId===participantId&&r.stageId===stageId)};
     },
     async inspectionContext(participantId,stageId){
      const {rows}=await client.query(
       "SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE \"participantStageInspectionId\" IS NULL)::int AS unlinked FROM \"Registration\" WHERE \"participantId\"=$1 AND \"stageId\"=$2 AND status=$3",
       [participantId,stageId,'ACTIVE']);
      return rows[0]??null;
     },
     async insertStageInspection(r){
      await client.query(
       'INSERT INTO "ParticipantStageInspection" (id,"participantId","stageId",status,"checkedByName","checkedAt",notes,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())',
       [r.id,r.participantId,r.stageId,r.status,r.checkedByName,r.checkedAt,r.notes]);
      await client.query(
       "UPDATE \"Registration\" SET \"participantStageInspectionId\"=$1 WHERE \"participantId\"=$2 AND \"stageId\"=$3 AND status=$4 AND \"participantStageInspectionId\" IS NULL",
       [r.id,r.participantId,r.stageId,'ACTIVE']);
     },
     async insertResult(r){
      await client.query(
       "INSERT INTO \"Result\" (id,\"registrationId\",\"registrationClassId\",value,unit,place,\"isBest\",notes,\"createdByUserId\",\"isHistorical\",\"verificationStatus\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL,false,'NOT_REQUIRED',now(),now())",
       [r.id,r.registrationId,r.registrationClassId,r.value,r.unit,r.place,r.isBest]);
     },
     async recordReceipt({stageId,eventHash,sequence,resultId,entity='Result',operator,baselineSha256}){
      await client.query(
       "INSERT INTO \"AuditLog\" (id,action,entity,\"entityId\",metadata,\"createdAt\") VALUES (gen_random_uuid(),$3,$4,$1,$2::jsonb,now())",
       [resultId,JSON.stringify({stageId,eventHash,sequence,operator,baselineSha256}),entity==='Result'?'VENUE_RESULT_IMPORTED':'VENUE_STAGE_INSPECTION_IMPORTED',entity]);
     },
    };
    const report=await callback(tx);
    await client.query(readOnly?'ROLLBACK':'COMMIT');
    return report;
   }catch(e){
    try{await client.query('ROLLBACK')}catch{}
    throw e;
   }
  },
 };
}
export async function runCentralApply({files,environment=process.env,stdin=readPassphrase()}){
 const [encryptedFile,publicKeyFile,mode]=files;
 if(!encryptedFile||!publicKeyFile||!['--dry-run','--apply'].includes(mode))
  throw Error('Usage: node apply-venue-return.mjs RETURN.json VENUE_PUBLIC.pem --dry-run|--apply');
 const stageId=environment.VENUE_RETURN_STAGE_ID??'';
 const baselineSha256=environment.VENUE_RETURN_BASELINE_SHA256??'';
 const trustedFingerprint=environment.VENUE_RETURN_TRUSTED_FINGERPRINT??'';
 if(!UUID.test(stageId)||![baselineSha256,trustedFingerprint].every(x=>SHA.test(x)))
  throw Error('Нужны отдельно подтверждённые UUID этапа, исходный SHA и отпечаток ключа');
 if(environment.USD_VENUE_LAN_MODE==='true')
  throw Error('Запрещён импорт возврата в локальную БД площадки');
 const apply=mode==='--apply';
 if(apply&&(environment.VENUE_RETURN_APPLY_CONFIRM!==stageId
  ||(environment.VENUE_RETURN_OPERATOR??'').trim().length<3))
  throw Error('Подтвердите UUID этапа и укажите администратора');
 const [raw,pem,passphrase]=await Promise.all([
  safeRead(encryptedFile,42*1024*1024),safeRead(publicKeyFile,4096),stdin,
 ]);
 const actual=createHash('sha256').update(createPublicKey(pem).export({type:'spki',format:'der'})).digest('hex');
 if(actual!==trustedFingerprint)throw Error('Отпечаток доверенного ключа не совпал');
 const snapshot=openVenueReturn(JSON.parse(raw),passphrase,pem,{
  stageId,baselineSha256,trustedFingerprint,now:Date.now(),
 });
 if(!environment.DATABASE_URL||environment.DATABASE_URL.length<20)
  throw Error('Нет центрального DATABASE_URL');
 const client=new pg.Client({connectionString:environment.DATABASE_URL,application_name:'usd_venue_return_operator'});
 try{
  await client.connect();
  const identity=await client.query('SELECT current_database() AS dbname');
  if(/^usd_venue(?:_|$)/.test(identity.rows[0]?.dbname??''))
   throw Error('CENTRAL APPLY не может работать с отдельной БД площадки');
  const report=await applyVenueReturnSnapshot(snapshot,postgresVenueAdapter(client),{
   apply,stageId,baselineSha256,operator:environment.VENUE_RETURN_OPERATOR??'',
  });
  if(apply&&report.counts.APPLIED+report.counts.ALREADY_APPLIED>0){
   try{
    // Rebuild is idempotent and may be re-run after a crash between COMMIT
    // and the derived-data phase. It is NOT an event-wide ACK.
    const entry=await import('../dist/scripts/finalize-venue-return.js');
    const finalize=entry.finalizeVenueStage??entry.default?.finalizeVenueStage;
    if(typeof finalize!=='function')throw Error('Finalizer missing from production build');
    const derived=await finalize(stageId,environment.DATABASE_URL);
    report.derivedRankingsRebuilt=Boolean(derived?.recalculated);
   }catch{
    report.derivedRankingsRebuilt=false;
    report.finalization='REQUIRES_ADMIN_RETRY';
   }
  }
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  // A database receipt is not official ranking, record publication or full sync.
  process.exitCode=3;
  return report;
 }finally{await client.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runCentralApply({files:process.argv.slice(2)}).catch(()=>{
  console.error('USD CENTRAL APPLY REFUSED: сохраните локальную БД и подписанный пакет.');
  process.exitCode=1;
 });
}
