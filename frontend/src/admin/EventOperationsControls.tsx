import {useViewState} from './view-state';

export function EventOperationsStagePicker({viewKey,stageId,stageName,children}:{viewKey:string;stageId:string;stageName?:string;children:React.ReactNode}){
 const [expanded,setExpanded]=useViewState(viewKey+':stageDrawer',false);
 return <details className="event-ops-stage-drawer" open={!stageId||expanded} onToggle={event=>{if(stageId)setExpanded(event.currentTarget.open)}}>
  <summary title={'Этап и фильтры: '+(stageName||'Выберите этап')}><strong>Этап</strong><span>{stageName||'Выберите этап'}</span></summary>
  {children}
 </details>;
}

export function EventOperationsActions({viewKey,children}:{viewKey:string;children:React.ReactNode}){
 const [expanded,setExpanded]=useViewState(viewKey+':actionsDrawer',false);
 return <details className="event-ops-actions-drawer" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>Действия</summary>{children}</details>;
}

export function EventOperationsSummary({viewKey,summary,children}:{viewKey:string;summary:string;children:React.ReactNode}){
 const [expanded,setExpanded]=useViewState(viewKey+':summaryDrawer',false);
 return <details className="event-ops-metrics-drawer" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary aria-label={summary}><span className="event-ops-summary-label">Сводка</span><span className="event-ops-summary-description">{summary}</span></summary>{children}</details>;
}
