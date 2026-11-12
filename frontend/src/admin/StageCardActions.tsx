import {useState} from 'react';
import {apiDelete,apiPost} from '../api';
import './stage-card-actions.css';

type StageActionItem={id:string;status:string;resultsPublishedAt?:string|null};

export function StageCardActions({stage,reload,go}:{stage:StageActionItem;reload:()=>Promise<unknown>;go:(path:string)=>void}){
 const [confirmation,setConfirmation]=useState<'publication'|'cancel'|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const published=Boolean(stage.resultsPublishedAt);
 const run=async(action:'publication'|'cancel')=>{
  if(busy)return;
  if(confirmation!==action){setConfirmation(action);setError('');return}
  setBusy(true);setError('');
  try{
   if(action==='publication')await apiPost('/stages/'+encodeURIComponent(stage.id)+'/results-publication',{published:!published,confirmed:true});
   else await apiDelete('/stages/'+encodeURIComponent(stage.id));
   setConfirmation(null);await reload();
  }catch(e){setError(e instanceof Error?e.message:'Не удалось изменить этап')}
  finally{setBusy(false)}
 };
 return <section className="stage-card-actions" aria-label="Быстрые действия этапа">
  <h3>Быстрые действия</h3>
  <div className="page-actions">
   <button type="button" className="secondary-button" disabled={busy} onClick={()=>go('/admin/stages/poster?stageId='+encodeURIComponent(stage.id))}>Афиша</button>
   <button type="button" className="secondary-button" disabled={busy} onClick={()=>void run('publication')}>{confirmation==='publication'?'Подтвердить: '+(published?'скрыть':'опубликовать')+' результаты':published?'Скрыть результаты':'Опубликовать результаты'}</button>
   {stage.status!=='CANCELLED'&&<button type="button" className="danger-button" disabled={busy} onClick={()=>void run('cancel')}>{confirmation==='cancel'?'Подтвердить отмену этапа':'Отменить этап'}</button>}
   {confirmation&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>{setConfirmation(null);setError('')}}>Отмена</button>}
  </div>
  {confirmation==='cancel'&&<p className="muted">Этап будет отменён, регистрация закроется. Участники и результаты сохранятся.</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </section>;
}
