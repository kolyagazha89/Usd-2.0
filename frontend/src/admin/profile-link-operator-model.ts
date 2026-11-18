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
