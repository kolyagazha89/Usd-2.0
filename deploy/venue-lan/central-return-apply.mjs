/**
 * Conservative, operator-approved venue return: ONLY new measurements whose
 * registration, class and PASSED inspection already exist centrally.
 * Every other journal operation stays pending, never silently acknowledged.
 * Cryptographic verification happens in venue-return-package.mjs BEFORE this.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCORE=/^\d{1,7}(?:\.\d{1,3})?$/;

export function planVenueResultEvent(event){
 const p=event?.payload;
 if(!p||p.table!=='Result'||p.operation!=='INSERT')
  return {status:'PENDING_MANUAL',reason:'UNSUPPORTED_OPERATION'};
 const row=p.after;
 if(!row||row.id!==p.recordId||!UUID.test(row.id??'')
  ||!UUID.test(row.registrationId??'')||!UUID.test(row.registrationClassId??''))
  return {status:'PENDING_MANUAL',reason:'RESULT_IDENTITY'};
 const value=String(row.value??'');
 if(!SCORE.test(value)||!Number.isFinite(Number(value))
  ||!['DB','MPS','OTHER'].includes(row.unit)
  ||row.isHistorical!==false
  ||row.verificationStatus!=='NOT_REQUIRED'
  ||typeof row.isBest!=='boolean'
  ||row.notes!==null
  ||(row.place!==null&&(!Number.isInteger(row.place)||row.place<1||row.place>999)))
  return {status:'PENDING_MANUAL',reason:'RESULT_FIELDS'};
 return {status:'CANDIDATE',row:{
  id:row.id,registrationId:row.registrationId,
  registrationClassId:row.registrationClassId,value,
  unit:row.unit,place:row.place,isBest:row.isBest,
 }};
}

export function planVenueStageInspectionEvent(event,stageId){
 const p=event?.payload,r=p?.after;
 if(p?.table!=='ParticipantStageInspection'||p.operation!=='INSERT')
  return {status:'PENDING_MANUAL',reason:'UNSUPPORTED_OPERATION'};
 if(!r||r.id!==p.recordId||r.stageId!==stageId
  ||!UUID.test(r.id??'')||!UUID.test(r.participantId??'')
  ||!['PASSED','FAILED'].includes(r.status)
  ||(r.notes!==null&&(typeof r.notes!=='string'||r.notes.length>1000))
  ||(r.status==='FAILED'&&!r.notes?.trim())
  ||(r.checkedByName!==null&&(typeof r.checkedByName!=='string'||r.checkedByName.length>120))
  ||typeof r.checkedAt!=='string'||!Number.isFinite(Date.parse(r.checkedAt))
  ||Date.parse(r.checkedAt)>Date.now()+300000)
  return {status:'PENDING_MANUAL',reason:'INSPECTION_FIELDS'};
 return {status:'CANDIDATE',row:{
  id:r.id,stageId:r.stageId,participantId:r.participantId,status:r.status,
  notes:r.notes,checkedByName:r.checkedByName,checkedAt:r.checkedAt,
 }};
}

/** Returns an outcome for EVERY operation; a successful subset is NOT a sync. */
export async function applyVenueReturnSnapshot(snapshot,adapter,{
 apply=false,operator='',baselineSha256='',stageId='',
}={}){
 if(!UUID.test(stageId)||snapshot?.stageId!==stageId
  ||!/^[a-f0-9]{64}$/.test(baselineSha256)
  ||snapshot.baselineSha256!==baselineSha256
  ||!Array.isArray(snapshot.events))
  throw new Error('Неверный закреплённый этап или исходный снимок');
 if(apply&&(!operator||operator.trim().length<3||operator.length>120))
  throw new Error('Для подтверждения нужен идентификатор администратора');
 // Transaction guard is mandatory in both modes, including a SERIALIZABLE
 // lock on the stage. The live database, not a stale export, decides conflicts.
 return adapter.transaction(async tx=>{
  const stage=await tx.stage(stageId);
  if(!stage||stage.isDeleted||!['PUBLISHED','COMPLETED'].includes(stage.status))
   throw new Error('Центральный этап не найден или неактивен');
  if(stage.resultsPublishedAt)
   throw new Error('Официальные результаты уже опубликованы: требуется ручное решение');
  // A later venue UPDATE/DELETE makes an earlier INSERT stale. Import neither
  // until the entire record's history can be reconciled manually.
  const frequencies=new Map(),classFrequencies=new Map(),inspectionFrequencies=new Map();
  for(const event of snapshot.events){
   const p=event?.payload;
   if(p?.table==='ParticipantStageInspection'){
    inspectionFrequencies.set(p.recordId,(inspectionFrequencies.get(p.recordId)??0)+1);
   }
   if(p?.table!=='Result')continue;
   frequencies.set(p.recordId,(frequencies.get(p.recordId)??0)+1);
   const cls=p.after?.registrationClassId??p.before?.registrationClassId;
   if(cls)classFrequencies.set(cls,(classFrequencies.get(cls)??0)+1);
  }
  const rows=[],counts={APPLIED:0,ALREADY_APPLIED:0,READY:0,PENDING_MANUAL:0,CONFLICT:0};
  for(const event of snapshot.events){
   const plan=event.payload?.table==='ParticipantStageInspection'
    ?planVenueStageInspectionEvent(event,stageId):planVenueResultEvent(event);
   let outcome=plan.status,reason=plan.reason??'';
   if(event.payload?.table==='ParticipantStageInspection'){
    if((inspectionFrequencies.get(event.payload.recordId)??0)>1){
     outcome='PENDING_MANUAL';reason='MULTIPLE_LOCAL_INSPECTION_MUTATIONS';
    }else if(plan.status==='CANDIDATE'){
     const r=plan.row,existing=await tx.stageInspection(r.id,r.participantId,stageId);
     const prior=existing.byId;
     const matches=prior&&prior.id===r.id&&prior.participantId===r.participantId
      &&prior.stageId===stageId&&prior.status===r.status
      &&prior.notes===r.notes&&prior.checkedByName===r.checkedByName
      &&new Date(prior.checkedAt).getTime()===new Date(r.checkedAt).getTime();
     if(matches){
      const receipt=await tx.receipt(stageId,event.hash);
      outcome=receipt?'ALREADY_APPLIED':'CONFLICT';
      reason=receipt?'SIGNED_INSPECTION_ALREADY_APPLIED':'UNPROVEN_INSPECTION_ORIGIN';
     }else if(existing.byId||existing.byParticipant){
      outcome='CONFLICT';reason='CENTRAL_INSPECTION_CHANGED';
     }else{
      const ctx=await tx.inspectionContext(r.participantId,stageId);
      if(!ctx||ctx.total<1||ctx.total!==ctx.unlinked){
       outcome='PENDING_MANUAL';reason='CENTRAL_REGISTRATION_DEPENDENCY';
      }else if(apply){
       await tx.insertStageInspection(r);
       await tx.recordReceipt({stageId,eventHash:event.hash,sequence:event.sequence,
        resultId:r.id,entity:'ParticipantStageInspection',operator,baselineSha256});
       outcome='APPLIED';reason='SIGNED_INSPECTION_IMPORTED';
      }else{outcome='READY';reason='CENTRAL_INSPECTION_PRECONDITIONS_MATCH';}
     }
    }
   }else{

   const cls=event.payload?.after?.registrationClassId??event.payload?.before?.registrationClassId;
   if(event.payload?.table==='Result'&&
     ((frequencies.get(event.payload.recordId)??0)>1||(cls&&(classFrequencies.get(cls)??0)>1))){
    outcome='PENDING_MANUAL';reason='MULTIPLE_LOCAL_RESULT_MUTATIONS';
   }else if(plan.status==='CANDIDATE'){
    const r=plan.row;
    const existing=await tx.result(r.id,r.registrationClassId);
    const exact=existing.byId&&existing.byId.id===r.id
      &&existing.byId.registrationId===r.registrationId
      &&existing.byId.registrationClassId===r.registrationClassId
      &&String(existing.byId.value)===r.value
      &&existing.byId.unit===r.unit
      &&existing.byId.place===r.place
      &&existing.byId.isBest===r.isBest
      &&existing.byId.notes===null
      &&existing.byId.isHistorical===false
      &&existing.byId.verificationStatus==='NOT_REQUIRED';
    if(exact){
     // An externally identical result is NOT acknowledged as ours unless
     // its original signed event was durably audited in the central DB.
     const receipt=await tx.receipt(stageId,event.hash);
     outcome=receipt?'ALREADY_APPLIED':'CONFLICT';
     reason=receipt?'SIGNED_EVENT_ALREADY_APPLIED':'UNPROVEN_RESULT_ORIGIN';
    }else if(existing.byId||existing.byClass){
     outcome='CONFLICT';reason='CENTRAL_RESULT_CHANGED';
    }else{
     const context=await tx.context(r.registrationId,r.registrationClassId,stageId);
     if(!context||context.registrationStatus!=='ACTIVE'
      ||context.stageId!==stageId||context.classId!==r.registrationClassId
      ||context.inspectionStatus!=='PASSED'||context.unit!==r.unit){
      outcome='PENDING_MANUAL';reason='CENTRAL_DEPENDENCIES_OR_INSPECTION';
     }else if(apply){
      await tx.insertResult(r);
      await tx.recordReceipt({stageId,eventHash:event.hash,sequence:event.sequence,
       resultId:r.id,operator,baselineSha256});
      outcome='APPLIED';reason='SIGNED_EVENT_IMPORTED';
     }else{outcome='READY';reason='CENTRAL_PRECONDITIONS_MATCH';}
    }
   }
   }
   counts[outcome]++;
   rows.push({sequence:event.sequence,status:outcome,reason});
  }
  return {stageId,journalEndHash:snapshot.journalEndHash,counts,rows,
   applied:counts.APPLIED>0,complete:apply&&counts.READY===0&&counts.PENDING_MANUAL===0&&counts.CONFLICT===0,
   centralReleaseAccepted:false,derivedRankingsRebuilt:false,
   pending:counts.PENDING_MANUAL+counts.CONFLICT,
   notice:'Импортируются только проверяемые инспекции уже существующих участников и измерения. Новые регистрации, оборудование и медиа требуют отдельной синхронизации; рейтинги и рекорды не пересчитаны.'};
 },{readOnly:!apply});
}
