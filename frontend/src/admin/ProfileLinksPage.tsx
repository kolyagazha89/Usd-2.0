import './profile-links.css';
import DuplicateProfilesPreview from './DuplicateProfilesPreview';
import {useEffect,useState} from 'react';
import {apiGet,apiPatch} from '../api';

type Coverage={
 totalProfiles:number;linkedProfiles:number;unlinkedProfiles:number;
 profilesWithLegacyEmail:number;unlinkedWithLegacyEmail:number;unlinkedWithoutLegacyEmail:number;
};
type LinkRequest={
 id:string;status:string;note:string;createdAt:string;decisionReason?:string|null;
 legacyEmailStatus?:'MATCH_VERIFIED'|'LEGACY_EMAIL_MISSING'|'EMAIL_DIFFERENT'|'EMAIL_NOT_VERIFIED';
 claimant:{id:string;email:string;participantId?:string|null};
 participant:{id:string;firstName:string;lastName:string;middleName?:string|null;user?:{id:string}|null};
};
const statusText:Record<string,string>={PENDING:'Ожидает проверки',APPROVED:'Привязан',REJECTED:'Отклонён',CONFLICT:'Конфликт'};
const diagnosticText:Record<string,string>={
 SELF_LINK_AVAILABLE:'Подтверждённый email аккаунта совпадает с архивной записью. При свободном профиле доступна самостоятельная привязка.',
 LEGACY_EMAIL_MISSING:'Для этого профиля не сохранено архивного email. Требуется проверка администратором; контактные данные не изменены.',
 LEGACY_EMAIL_DIFFERENT:'Архивный email не совпадает с подтверждённым email аккаунта. Требуется ручная проверка.',
 EMAIL_NOT_VERIFIED:'У аккаунта отсутствует подтверждение email.',
 ACCOUNT_INACTIVE:'Аккаунт неактивен.',
 ACCOUNT_ALREADY_LINKED:'К аккаунту уже прикреплён другой профиль.',
 PROFILE_ALREADY_LINKED:'Этот профиль уже прикреплён к аккаунту.',
 ALREADY_LINKED:'Этот аккаунт уже связан с выбранным профилем.',
 ACCOUNT_NOT_FOUND:'Аккаунт не найден.',PROFILE_NOT_FOUND:'Профиль не найден.',
};
const legacyStatusText:Record<string,string>={MATCH_VERIFIED:'Исторический email совпадает с подтверждённым аккаунтом. Если появилась заявка, проверьте момент отправки и статус предыдущей привязки.',LEGACY_EMAIL_MISSING:'Исторический email отсутствует в таблице привязки; автоматическая привязка недоступна.',EMAIL_DIFFERENT:'Email аккаунта отличается от сохранённого исторического email; нужна ручная проверка.',EMAIL_NOT_VERIFIED:'Email заявителя ещё не подтверждён; привязка будет отклонена сервером.'};
function ProfileLinksPage({PageFrame,LoadingPage,ErrorPanel}:{PageFrame:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>}){
 const [coverage,setCoverage]=useState<Coverage|null>(null),[coverageError,setCoverageError]=useState('');
 const [rows,setRows]=useState<LinkRequest[]>([]),[status,setStatus]=useState('PENDING'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [diagnoses,setDiagnoses]=useState<Record<string,string>>({}),[diagnosing,setDiagnosing]=useState<string|null>(null);
 const loadCoverage=async()=>{try{setCoverageError('');setCoverage(await apiGet<Coverage>('/admin/profile-links/coverage'))}catch(e){setCoverageError(e instanceof Error?e.message:'Статистика архивных email недоступна')}};
 useEffect(()=>{void loadCoverage()},[]);
 const load=async()=>{setLoading(true);setError('');try{const data=await apiGet<any>('/admin/profile-links'+(status?'?status='+encodeURIComponent(status):''));setRows(Array.isArray(data)?data:data?.data??[])}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить заявки')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[status]);
 const diagnose=async(row:LinkRequest)=>{
  if(diagnosing)return;
  setDiagnosing(row.id);setError('');
  try{
   const result=await apiGet<{code:string;canSelfLink:boolean}>('/admin/profile-links/diagnostics?userId='+encodeURIComponent(row.claimant.id)+'&participantId='+encodeURIComponent(row.participant.id));
   setDiagnoses(current=>({...current,[row.id]:diagnosticText[result.code]||'Состояние привязки изменилось. Обновите список.'}));
  }catch(e){setError(e instanceof Error?e.message:'Не удалось проверить историю email')}
  finally{setDiagnosing(null)}
 };
 const review=async(row:LinkRequest,decision:'APPROVE'|'REJECT')=>{
  if(busy)return;
  if(decision==='APPROVE'&&(row.participant.user||row.claimant.participantId)){
   setError('Привязка заблокирована: профиль или аккаунт уже занят. Обновите список.');return;
  }
  setBusy(true);setError('');
  try{
   await apiPatch('/admin/profile-links/'+encodeURIComponent(row.id),{decision});
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Не удалось обработать заявку')}finally{setBusy(false)}
 };
 return <PageFrame title="Привязка профилей" subtitle="Заявки на восстановление исторических профилей. Привязка только после проверки владения администратором.">
  <section className="profile-email-coverage" aria-label="Наличие email в исторических профилях">
   <div className="profile-email-coverage-heading"><div><h2>Email исторических участников</h2><p>Подсчёт по реальной базе USD. Учитываются действующие профили без объединённых дублей.</p></div><button type="button" className="secondary-button compact" onClick={()=>void loadCoverage()}>Обновить</button></div>
   {coverageError&&<p role="alert">{coverageError}</p>}
   {!coverage&&!coverageError&&<p role="status">Загружаем статистику…</p>}
   {coverage&&<div className="profile-email-coverage-grid">
    <div><small>Всего профилей</small><strong>{coverage.totalProfiles}</strong></div>
    <div><small>Уже привязаны к аккаунту</small><strong>{coverage.linkedProfiles}</strong></div>
    <div><small>Архивный email есть (без привязки)</small><strong>{coverage.unlinkedWithLegacyEmail}</strong></div>
    <div><small>Без архивного email (без привязки)</small><strong>{coverage.unlinkedWithoutLegacyEmail}</strong></div>
   </div>}
   <p className="muted">Не означает автоматическую привязку: она возможна только при совпадении архивного адреса с подтверждённым email нового аккаунта. Для остальных доступна ручная заявка администратору.</p>
  </section>
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
    {row.legacyEmailStatus&&<p className="muted" role="status"><strong>Проверка email:</strong> {legacyStatusText[row.legacyEmailStatus]}</p>}
    <button type="button" onClick={()=>void diagnose(row)} disabled={!!diagnosing||busy} aria-label="Проверить возможность самостоятельной привязки по архивной почте">{diagnosing===row.id?'Проверяем…':'Проверить историческую привязку'}</button>
    {diagnoses[row.id]&&<p className="muted" role="status"><strong>Диагностика:</strong> {diagnoses[row.id]}</p>}
    {row.participant.user&&<p role="alert">Профиль уже привязан к аккаунту. Не подтверждайте без расследования.</p>}
    {row.claimant.participantId&&<p role="alert">У заявителя уже есть профиль. Привязка запрещена.</p>}
    {row.decisionReason&&<p>Решение: {row.decisionReason}</p>}
   </div>
   {row.status==='PENDING'&&<div className="profile-link-actions">
    <p className="muted">Нажатие «Подтвердить привязку» означает, что администратор проверил принадлежность профиля. Решение автоматически сохраняется в журнале.</p>
    <div className="profile-link-decisions">
     <button type="button" className="primary-button" disabled={busy||!!row.participant.user||!!row.claimant.participantId} onClick={()=>void review(row,'APPROVE')}>{busy?'Сохраняем…':'Подтвердить привязку'}</button>
     <button type="button" disabled={busy} onClick={()=>void review(row,'REJECT')}>Отклонить</button>
    </div>
   </div>}
  </article>)}</div>}
 </PageFrame>;
}
export default ProfileLinksPage;
