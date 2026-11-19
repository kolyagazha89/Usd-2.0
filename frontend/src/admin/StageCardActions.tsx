import {useEffect,useState} from 'react';
import {apiDelete,apiGet,apiPost} from '../api';
import './stage-card-actions.css';

type StageActionItem={id:string;status:string;updatedAt?:string;resultsPublishedAt?:string|null};
type CriticalNotice={
 pending:boolean;revision:number;changedLabels:string[];recipients:number;
 canSend:boolean;mailReady:boolean;mailNote:string;sending:boolean;lastSentAt?:string|null;
};

export function StageCardActions({stage,reload,go}:{stage:StageActionItem;reload:()=>Promise<unknown>;go:(path:string)=>void}){
 const [confirmation,setConfirmation]=useState<'publication'|'cancel'|'notify'|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [notice,setNotice]=useState<CriticalNotice|null>(null),[noticeLoading,setNoticeLoading]=useState(true);
 const published=Boolean(stage.resultsPublishedAt);
 const loadNotice=async()=>setNotice(await apiGet<CriticalNotice>('/stages/'+encodeURIComponent(stage.id)+'/critical-notice'));
 useEffect(()=>{
  let active=true;setNoticeLoading(true);setNotice(null);
  apiGet<CriticalNotice>('/stages/'+encodeURIComponent(stage.id)+'/critical-notice')
   .then(value=>{if(active)setNotice(value)})
   .catch(()=>{if(active)setError('Не удалось проверить состояние рассылки. Обновите карточку.')})
   .finally(()=>{if(active)setNoticeLoading(false)});
  return()=>{active=false};
 },[stage.id,stage.updatedAt]);
 const run=async(action:'publication'|'cancel'|'notify')=>{
  if(busy)return;
  if(action==='notify'&&!notice?.canSend)return;
  if(confirmation!==action){setConfirmation(action);setError('');return}
  setBusy(true);setError('');
  try{
   if(action==='publication')await apiPost('/stages/'+encodeURIComponent(stage.id)+'/results-publication',{published:!published,confirmed:true});
   else if(action==='cancel')await apiDelete('/stages/'+encodeURIComponent(stage.id));
   else{
    const result=await apiPost<{completed:boolean;total:number;accepted:number;failed:number}>(
      '/stages/'+encodeURIComponent(stage.id)+'/critical-notice',{revision:notice!.revision,confirmed:true});
    if(!result.completed)setError('Часть писем не была принята почтовым сервером ('+result.accepted+' из '+result.total+'). Проверьте журнал почты и повторите позже.');
    else setError('Почтовый сервер принял '+result.accepted+' писем. Фактическая доставка во «Входящие» не подтверждается.');
   }
   setConfirmation(null);
   await reload();
   if(action==='notify')await loadNotice();
  }catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить действие с этапом');if(action==='notify')await loadNotice().catch(()=>undefined)}
  finally{setBusy(false)}
 };
 return <section className="stage-card-actions" aria-label="Быстрые действия этапа">
  <h3>Быстрые действия</h3>
  <div className="page-actions">
   <button type="button" className="secondary-button" disabled={busy} onClick={()=>go('/admin/stages/poster?stageId='+encodeURIComponent(stage.id))}>Афиша</button>
   <button type="button" className="secondary-button" disabled={busy||noticeLoading||!notice?.canSend}
    onClick={()=>void run('notify')}>{confirmation==='notify'?'Подтвердить отправку '+notice?.recipients+' участникам':'Уведомить участников'}</button>
   <button type="button" className="secondary-button" disabled={busy} onClick={()=>void run('publication')}>{confirmation==='publication'?'Подтвердить: '+(published?'скрыть':'опубликовать')+' результаты':published?'Скрыть результаты':'Опубликовать результаты'}</button>
   {stage.status!=='CANCELLED'&&<button type="button" className="danger-button" disabled={busy} onClick={()=>void run('cancel')}>{confirmation==='cancel'?'Подтвердить отмену этапа':'Отменить этап'}</button>}
   {confirmation&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>{setConfirmation(null);setError('')}}>Отмена</button>}
  </div>
  {notice?.pending&&<p className="stage-critical-details">
   <strong>Изменения для уведомления:</strong> {notice.changedLabels.join(', ')}.
   Получатели с подтверждённой почтой: {notice.recipients}.
   {!notice.mailReady&&<span> {notice.mailNote}</span>}
  </p>}
  {notice?.sending&&<p className="muted">Рассылка уже выполняется. Повторный запуск заблокирован.</p>}
  {confirmation==='notify'&&<p className="muted">Будет отправлено только служебное письмо об изменении даты, времени, адреса, площадки или отмене этапа. Отправка подтверждается почтовым сервером, но не гарантирует доставку во «Входящие».</p>}
  {confirmation==='cancel'&&<p className="muted">Этап будет отменён, регистрация закроется. Участники и результаты сохранятся. Письма автоматически не отправляются — после отмены используйте «Уведомить участников».</p>}
  {error&&<p className={error.startsWith('Почтовый сервер принял')?'muted':'form-error'} role="status">{error}</p>}
 </section>;
}
