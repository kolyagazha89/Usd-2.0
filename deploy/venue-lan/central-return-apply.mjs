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

function isCoherentLocalResultHistory(events){
 const first=events[0]?.payload,origin=first?.after;
 if(first?.operation!=='INSERT'||!origin||origin.notes!==null)return false;
 for(let i=1;i<events.length;i++){
  const current=events[i]?.payload,prev=events[i-1]?.payload;
  if(current?.operation!=='UPDATE'||!current.before||!current.after
   ||current.before.notes!==null||current.after.notes!==null
   ||current.after.id!==origin.id
   ||current.after.registrationId!==origin.registrationId
   ||current.after.registrationClassId!==origin.registrationClassId
   ||JSON.stringify(current.before)!==JSON.stringify(prev.after))
   return false;
 }
 return true;
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
  // Collect signed histories first: ordinary judging recalculates places by
  // updating the same Result shortly after INSERT. Import only the FINAL row
  // when every consecutive before/after matches, with one receipt per event.
  const resultGroups=new Map(),classResultIds=new Map(),inspectionFrequencies=new Map();
  for(const event of snapshot.events){
   const p=event?.payload;
   if(p?.table==='ParticipantStageInspection'){
    inspectionFrequencies.set(p.recordId,(inspectionFrequencies.get(p.recordId)??0)+1);
   }
   if(p?.table!=='Result')continue;
   const list=resultGroups.get(p.recordId)??[];
   list.push(event);resultGroups.set(p.recordId,list);
   const cls=p.after?.registrationClassId??p.before?.registrationClassId;
   if(cls){
    const ids=classResultIds.get(cls)??new Set();
    ids.add(p.recordId);classResultIds.set(cls,ids);
   }
  }
  // A local change to entrants, admission classes or stage state can make
  // the central roster appear valid while the venue used a different reality.
  // Until those dependencies are reconciled, never import measurements or
  // PASSED inspections from a partially diverged stage.
  const blockingTables=new Set([
   'Stage','Participant','Car','CarConfiguration','CarConfigurationVersion',
   'CarAmplifier','CarAudioComponent','CarBattery','CarGenerator','CarHeadUnit',
   'Registration','RegistrationNumber','RegistrationClass',
   'Inspection','RegistrationClassInspection','Disqualification',
  ]);
  const divergentDependencies=snapshot.events.some(e=>blockingTables.has(e?.payload?.table));
  const processedResults=new Map();
  const rows=[],counts={APPLIED:0,ALREADY_APPLIED:0,READY:0,PENDING_MANUAL:0,CONFLICT:0};
  for(const event of snapshot.events){
   const plan=event.payload?.table==='ParticipantStageInspection'
    ?planVenueStageInspectionEvent(event,stageId):planVenueResultEvent(event);
   let outcome=plan.status,reason=plan.reason??'';
   if(event.payload?.table==='ParticipantStageInspection'){
    if(divergentDependencies){
     outcome='PENDING_MANUAL';reason='UNRECONCILED_VENUE_DEPENDENCIES';
    }else if((inspectionFrequencies.get(event.payload.recordId)??0)>1){
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
   }else if(event.payload?.table==='Result'){
    if(divergentDependencies){
     outcome='PENDING_MANUAL';reason='UNRECONCILED_VENUE_DEPENDENCIES';
    }else{
    const id=event.payload.recordId,group=resultGroups.get(id)??[];
    if(processedResults.has(id)){
     ({outcome,reason}=processedResults.get(id));
    }else{
     const first=group[0],last=group[group.length-1];
     const cls=first?.payload?.after?.registrationClassId;
     const safe=group.length>0&&isCoherentLocalResultHistory(group)
      &&cls&&(classResultIds.get(cls)?.size??0)===1;
     const finalPlan=safe?planVenueResultEvent({
      payload:{...first.payload,after:last.payload.after},
     }):null;
     if(!safe||finalPlan?.status!=='CANDIDATE'){
      outcome='PENDING_MANUAL';reason='LOCAL_RESULT_HISTORY_REQUIRES_REVIEW';
     }else{
      const r=finalPlan.row,existing=await tx.result(r.id,r.registrationClassId);
      const same=existing.byId&&existing.byId.id===r.id
       &&existing.byId.registrationId===r.registrationId
       &&existing.byId.registrationClassId===r.registrationClassId
       &&String(existing.byId.value)===r.value
       &&existing.byId.unit===r.unit
       // Re-ranking is a central derived write; it may change place/isBest
       // after the signed event was imported. Never treat it as a replay conflict.
       &&existing.byId.notes===null
       &&existing.byId.isHistorical===false
       &&existing.byId.verificationStatus==='NOT_REQUIRED';
      if(same){
       let allReceipts=true;
       for(const item of group){
        if(!await tx.receipt(stageId,item.hash)){allReceipts=false;break;}
       }
       outcome=allReceipts?'ALREADY_APPLIED':'CONFLICT';
       reason=allReceipts?'SIGNED_HISTORY_ALREADY_IMPORTED':'UNPROVEN_RESULT_ORIGIN';
      }else if(existing.byId||existing.byClass){
       outcome='CONFLICT';reason='CENTRAL_RESULT_CHANGED';
      }else{
       const ctx=await tx.context(r.registrationId,r.registrationClassId,stageId);
       if(!ctx||ctx.registrationStatus!=='ACTIVE'||ctx.stageId!==stageId
        ||ctx.classId!==r.registrationClassId||ctx.inspectionStatus!=='PASSED'
        ||ctx.unit!==r.unit){
        outcome='PENDING_MANUAL';reason='CENTRAL_DEPENDENCIES_OR_INSPECTION';
       }else if(apply){
        await tx.insertResult(r);
        for(const item of group){
         await tx.recordReceipt({stageId,eventHash:item.hash,sequence:item.sequence,
          resultId:r.id,operator,baselineSha256});
        }
        outcome='APPLIED';reason='SIGNED_FINAL_RESULT_IMPORTED';
       }else{outcome='READY';reason='CENTRAL_PRECONDITIONS_MATCH';}
      }
     }
     processedResults.set(id,{outcome,reason});
    }
    }
   }
   counts[outcome]++;
   rows.push({sequence:event.sequence,status:outcome,reason});
  }
  return {stageId,journalEndHash:snapshot.journalEndHash,counts,rows,
   applied:counts.APPLIED>0,complete:false,
   centralReleaseAccepted:false,derivedRankingsRebuilt:false,
   pending:counts.PENDING_MANUAL+counts.CONFLICT,
   notice:'Импортируются только проверяемые инспекции уже существующих участников и измерения. Новые регистрации, оборудование и медиа требуют отдельной синхронизации; рейтинги и рекорды не пересчитаны.'};
 },{readOnly:!apply});
}
