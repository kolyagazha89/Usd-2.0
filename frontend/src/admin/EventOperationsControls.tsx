import {useViewState} from './view-state';

export function EventOperationsStagePicker({viewKey,stageId,stageName,children}:{viewKey:string;stageId:string;stageName?:string;children:React.ReactNode}){
 const [expanded,setExpanded]=useViewState(viewKey+':stageDrawer',false);
 return <details className="event-ops-stage-drawer" open={!stageId||expanded} onToggle={event=>{if(stageId)setExpanded(event.currentTarget.open)}}>
  <summary><strong>Этап и фильтры</strong><span>{stageName||'Выберите этап'}</span></summary>
  {children}
 </details>;
}

export function EventOperationsActions({viewKey,children}:{viewKey:string;children:React.ReactNode}){
 const [expanded,setExpanded]=useViewState(viewKey+':actionsDrawer',false);
 return <details className="event-ops-actions-drawer" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>Действия</summary>{children}</details>;
}
