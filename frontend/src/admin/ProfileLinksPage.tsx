import './profile-links.css';
import DuplicateProfilesPreview from './DuplicateProfilesPreview';
import {useEffect,useState} from 'react';
import {apiGet,apiPatch} from '../api';

type LinkRequest={
 id:string;status:string;note:string;createdAt:string;decisionReason?:string|null;
 claimant:{id:string;email:string;participantId?:string|null};
 participant:{id:string;firstName:string;lastName:string;middleName?:string|null;user?:{id:string}|null};
};
const statusText:Record<string,string>={PENDING:'Ожидает проверки',APPROVED:'Привязан',REJECTED:'Отклонён',CONFLICT:'Конфликт'};
function ProfileLinksPage({PageFrame,LoadingPage,ErrorPanel}:{PageFrame:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>}){
 const [rows,setRows]=useState<LinkRequest[]>([]),[status,setStatus]=useState('PENDING'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reviewingId,setReviewingId]=useState('');
 const load=async()=>{setLoading(true);setError('');try{const data=await apiGet<any>('/admin/profile-links'+(status?'?status='+encodeURIComponent(status):''));setRows(Array.isArray(data)?data:data?.data??[])}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить заявки')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[status]);
 const review=async(row:LinkRequest,decision:'APPROVE'|'REJECT')=>{
  if(busy)return;
  setBusy(true);setReviewingId(row.id);setError('');
  try{
   await apiPatch('/admin/profile-links/'+encodeURIComponent(row.id),{decision});
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Не удалось обработать заявку')}finally{setBusy(false);setReviewingId('')}
 };
 return <PageFrame title="Привязка профилей" subtitle="Заявки на восстановление исторических профилей. Привязка только после проверки владения администратором.">
  <DuplicateProfilesPreview/>
  <div className="profile-link-filters"><label>Статус
   <select value={status} onChange={e=>{setStatus(e.target.value);setError('')}}>
    <option value="">Все</option>{Object.entries(statusText).map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select></label><button type="button" onClick={()=>void load()} disabled={loading||busy}>Обновить</button></div>
  {error&&<div className="form-error" role="alert">{error}</div>}
  {loading?<LoadingPage/>:rows.length===0?<p className="muted">Заявок с выбранным статусом нет.</p>:<div className="profile-link-list">{rows.map(row=><article className="profile-link-card" key={row.id}>
   <div><small>{statusText[row.status]??row.status} · {new Date(row.createdAt).toLocaleString('ru-RU')}</small>
    <h3>{[row.participant.lastName,row.participant.firstName,row.participant.middleName].filter(Boolean).join(' ')}</h3>
    <p>Аккаунт заявителя: <strong>{row.claimant.email}</strong></p>
    <p>Сведения для проверки: {row.note}</p>
    {row.participant.user&&<p role="alert">Профиль уже привязан к аккаунту. Не подтверждайте без расследования.</p>}
    {row.claimant.participantId&&<p role="alert">У заявителя уже есть профиль. Привязка запрещена.</p>}
    {row.decisionReason&&<p>Решение: {row.decisionReason}</p>}
   </div>
   {row.status==='PENDING'&&<div className="profile-link-actions">
    <div className="profile-link-decisions">
     <button type="button" className="primary-button" disabled={busy||!!row.participant.user||!!row.claimant.participantId} aria-busy={reviewingId===row.id} onClick={()=>void review(row,'APPROVE')}>{reviewingId===row.id?'Сохраняем…':'Подтвердить привязку'}</button>
     <button type="button" disabled={busy} onClick={()=>void review(row,'REJECT')}>Отклонить</button>
    </div>
    <small>Одобрение означает, что администратор проверил принадлежность профиля. Решение и его автор сохраняются в журнале автоматически.</small>
   </div>
  </article>)}</div>}
 </PageFrame>;
}
export default ProfileLinksPage;
