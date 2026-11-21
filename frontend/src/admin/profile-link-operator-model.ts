/**
 * Keep approved/rejected requests out of the pending queue immediately after
 * the server accepts a decision; a failed follow-up GET must not resurrect it.
 */
export function afterProfileLinkDecision<T extends {id:string;status:string}>(
 rows:readonly T[],id:string,decision:'APPROVE'|'REJECT',filter:string
):T[]{
 const nextStatus=decision==='APPROVE'?'APPROVED':'REJECTED';
 if(filter&&filter!==nextStatus)return rows.filter(row=>row.id!==id);
 return rows.map(row=>row.id===id?{...row,status:nextStatus} as T:row);
}


export function filterProfileLinkRequests<T extends {
 claimant?:{email?:string|null};
 participant?:{lastName?:string|null;firstName?:string|null;middleName?:string|null};
 note?:string|null;
}>(rows:readonly T[],query:string):T[]{
 const needle=query.trim().toLocaleLowerCase('ru');
 if(!needle)return [...rows];
 return rows.filter(row=>[
  row.claimant?.email,
  row.participant?.lastName,row.participant?.firstName,row.participant?.middleName,
  row.note,
 ].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(needle));
}

export function profileLinkBlockReason(row:{
 participant:{user?:unknown};
 claimant:{participantId?:string|null};
}):string|null{
 if(row.participant.user&&row.claimant.participantId)return 'Профиль и аккаунт уже привязаны';
 if(row.participant.user)return 'Профиль уже привязан к аккаунту';
 if(row.claimant.participantId)return 'У заявителя уже есть профиль';
 return null;
}

export function nextPendingProfileLink<T extends {id:string;status:string}>(rows:readonly T[],decidedId:string):T|undefined{
 const index=rows.findIndex(row=>row.id===decidedId);
 return rows.slice(index+1).find(row=>row.status==='PENDING')
   ?? rows.slice(0,Math.max(0,index)).reverse().find(row=>row.status==='PENDING');
}
