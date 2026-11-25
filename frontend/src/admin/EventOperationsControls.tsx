export function EventOperationsStagePicker({stageId,stageName,children}:{stageId:string;stageName?:string;children:React.ReactNode}){
 return <details className="event-ops-stage-drawer" open={stageId?undefined:true}>
  <summary><strong>Этап и фильтры</strong><span>{stageName||'Выберите этап'}</span></summary>
  {children}
 </details>;
}

export function EventOperationsActions({children}:{children:React.ReactNode}){
 return <details className="event-ops-actions-drawer"><summary>Действия</summary>{children}</details>;
}
