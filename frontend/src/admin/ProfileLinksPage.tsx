import {AdminEntityLink} from './AdminEntityLink';
import './profile-links.css';
import DuplicateProfilesPreview from './DuplicateProfilesPreview';
import {afterProfileLinkDecision,filterProfileLinkRequests,nextPendingProfileLink,profileLinkBlockReason} from './profile-link-operator-model';
import {AdminListPagination} from './AdminListPagination';
import {paginateResourceRows} from './admin-table-model';
import {useEffect,useRef,useState} from 'react';
import {apiGet,apiPatch,apiPost} from '../api';

type Coverage={
 totalProfiles:number;linkedProfiles:number;unlinkedProfiles:number;
 profilesWithLegacyEmail:number;unlinkedWithLegacyEmail:number;unlinkedWithoutLegacyEmail:number;
};
type EmailAudit={rowsWithEmail:number;matchedRows:number;safeProfiles:number;conflictingProfiles:number;ambiguousRows:number;unmatchedRows:number;invalidEmailRows:number;applied:boolean;updatedProfiles?:number};
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
 const [emailAudit,setEmailAudit]=useState<EmailAudit|null>(null),[emailBusy,setEmailBusy]=useState(false),[emailError,setEmailError]=useState('');
 const [rows,setRows]=useState<LinkRequest[]>([]),[status,setStatus]=useState('PENDING'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [diagnoses,setDiagnoses]=useState<Record<string,string>>({}),[diagnosing,setDiagnosing]=useState<string|null>(null);
 const [advancedVisited,setAdvancedVisited]=useState(false);
 const [reviewNotice,setReviewNotice]=useState(''),[query,setQuery]=useState('');
 const [selectedId,setSelectedId]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 const requestId=useRef(0);
 const focusReview=useRef(false),reviewHeading=useRef<HTMLHeadingElement>(null),queueHeading=useRef<HTMLHeadingElement>(null);
 const visibleRows=filterProfileLinkRequests(rows,query);
 const pagination=paginateResourceRows(visibleRows,page,pageSize);
 const selected=visibleRows.find(row=>row.id===selectedId)??(status==='PENDING'?pagination.rows[0]:undefined);
 const blocked=selected?profileLinkBlockReason(selected):null;
 const nameOf=(row:LinkRequest)=>[row.participant.lastName,row.participant.firstName,row.participant.middleName].filter(Boolean).join(' ');
 useEffect(()=>{
  if(focusReview.current){(reviewHeading.current??queueHeading.current)?.focus();focusReview.current=false}
 },[selected?.id,reviewNotice]);
 const loadCoverage=async()=>{try{setCoverageError('');setCoverage(await apiGet<Coverage>('/admin/profile-links/coverage'))}catch(e){setCoverageError(e instanceof Error?e.message:'Статистика архивных email недоступна')}};
 useEffect(()=>{if(advancedVisited)void loadCoverage()},[advancedVisited]);
 const reconcileEmails=async(apply:boolean)=>{
  if(emailBusy)return;setEmailBusy(true);setEmailError('');
  try{const result=apply?await apiPost<EmailAudit>('/admin/profile-links/emails/reconcile',{confirmation:'APPLY'}):await apiGet<EmailAudit>('/admin/profile-links/emails/reconcile');
   setEmailAudit(result);if(apply)await loadCoverage();
  }catch(e){setEmailError(e instanceof Error?e.message:'Сверка архивных email не удалась')}
  finally{setEmailBusy(false)}
 };

 const load=async(quiet=false)=>{
  const request=++requestId.current;
  if(!quiet)setLoading(true);
  setError('');
  try{
   const data=await apiGet<any>('/admin/profile-links'+(status?'?status='+encodeURIComponent(status):''));
   if(request===requestId.current)setRows(Array.isArray(data)?data:data?.data??[]);
  }catch(e){if(request===requestId.current)setError(e instanceof Error?e.message:'Не удалось загрузить заявки')}
  finally{if(request===requestId.current)setLoading(false)}
 };
 useEffect(()=>{void load();return()=>{requestId.current++}},[status]);
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
  if(busy||loading||row.status!=='PENDING')return;
  if(decision==='APPROVE'&&profileLinkBlockReason(row)){
   setError('Привязка заблокирована: профиль или аккаунт уже занят. Обновите список.');return;
  }
  setBusy(true);setError('');setReviewNotice('');
  try{
   await apiPatch('/admin/profile-links/'+encodeURIComponent(row.id),{decision});
   const next=nextPendingProfileLink(visibleRows,row.id);
   const remaining=afterProfileLinkDecision(visibleRows,row.id,decision,status);
   setRows(current=>afterProfileLinkDecision(current,row.id,decision,status));
   if(next){
    setPage(Math.floor(remaining.findIndex(item=>item.id===next.id)/pagination.pageSize)+1);
    setSelectedId(next.id);
   }else{setSelectedId('')}
   focusReview.current=true;
   if(decision==='APPROVE')setReviewNotice('Привязка подтверждена');
   else setReviewNotice('Заявка отклонена');
   await load(true);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось обработать заявку')}finally{setBusy(false)}
 };
 return <PageFrame title="Привязка профилей" subtitle="Заявки на восстановление исторических профилей. Привязка только после проверки владения администратором.">
  <section className="profile-link-work-queue" aria-label="Заявки на привязку профилей">
   <header className="profile-link-queue-heading"><div><h2 ref={queueHeading} tabIndex={-1}>Заявки на привязку</h2></div>{status==='PENDING'&&!loading&&<span className="profile-link-pending-count" role="status">{rows.length} ожидают решения</span>}</header>
  <div className="profile-link-filters"><label>Поиск заявок<input type="search" aria-label="Поиск заявок по ФИО или email" placeholder="ФИО, email, заметка…" value={query} disabled={busy} onChange={e=>{setQuery(e.target.value);setSelectedId('');setPage(1)}}/></label><label>Статус
   <select value={status} disabled={busy} onChange={e=>{requestId.current++;setRows([]);setLoading(true);setStatus(e.target.value);setError('');setReviewNotice('');setSelectedId('');setPage(1)}}>
    <option value="">Все</option>{Object.entries(statusText).map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select></label>{query&&<button type="button" className="secondary-button compact" aria-label="Сбросить поиск заявок" disabled={busy} onClick={()=>{setQuery('');setSelectedId('');setPage(1)}}>Очистить</button>}<button type="button" onClick={()=>void load()} disabled={loading||busy}>Обновить</button></div>
  {reviewNotice&&<p className="profile-link-review-notice" role="status">{reviewNotice}</p>}
  {error&&<div className="form-error" role="alert">{error}</div>}
  {loading?<LoadingPage/>:visibleRows.length===0?<p className="muted">{query?'По вашему запросу заявок не найдено':'Заявок с выбранным статусом нет.'}</p>:<div className="profile-link-workspace">
   <div className="profile-link-list">
    {visibleRows.length>10&&<AdminListPagination label="заявок" total={visibleRows.length} page={pagination.page} pageCount={pagination.pageCount} pageSize={pagination.pageSize} onPageChange={next=>{if(!busy){setPage(next);setSelectedId('')}}} onPageSizeChange={size=>{if(!busy){setPageSize(size);setPage(1);setSelectedId('')}}}/>}
    <ul aria-label="Очередь заявок">{pagination.rows.map(row=>{
     const reason=row.status==='PENDING'?profileLinkBlockReason(row):null;
     return <li key={row.id}><button type="button" className="profile-link-row" aria-pressed={selected?.id===row.id}
      disabled={busy} onClick={()=>{if(selected?.id===row.id)reviewHeading.current?.focus();else{focusReview.current=true;setSelectedId(row.id)}}}>
      <span><strong>{nameOf(row)}</strong><small>{row.claimant.email}</small></span>
      <span className={reason?'profile-link-blocked':undefined}>{reason??statusText[row.status]??row.status}</span>
     </button></li>;
    })}</ul>
   </div>
   {selected&&<article className="profile-link-card" aria-labelledby="profile-link-review-title">
    <div>
     <small>{statusText[selected.status]??selected.status} · {new Date(selected.createdAt).toLocaleString('ru-RU')}</small>
     <h3 id="profile-link-review-title" ref={reviewHeading} tabIndex={-1}><AdminEntityLink kind="participant" id={selected.participant.id}>{nameOf(selected)}</AdminEntityLink></h3>
     <p>Аккаунт заявителя: <strong>{selected.claimant.email}</strong></p>
     {selected.note&&<p>Сведения для проверки: {selected.note}</p>}
     {selected.legacyEmailStatus&&<p className="muted"><strong>Проверка email:</strong> {legacyStatusText[selected.legacyEmailStatus]}</p>}
     {blocked&&selected.status==='PENDING'&&<p className="profile-link-blocked" role="status">{blocked}</p>}
     <button type="button" className="secondary-button compact" onClick={()=>void diagnose(selected)} disabled={!!diagnosing||busy} aria-label="Проверить возможность самостоятельной привязки по архивной почте">{diagnosing===selected.id?'Проверяем…':'Проверить историческую привязку'}</button>
     {diagnoses[selected.id]&&<p className="muted" role="status"><strong>Диагностика:</strong> {diagnoses[selected.id]}</p>}
     {selected.decisionReason&&<p>Решение: {selected.decisionReason}</p>}
    </div>
    {selected.status==='PENDING'&&<div className="profile-link-actions">
     <p className="muted">Подтверждайте заявку после проверки, что профиль принадлежит заявителю.</p>
     <div className="profile-link-decisions">
      <button type="button" className="primary-button" disabled={busy||!!blocked} onClick={()=>void review(selected,'APPROVE')}>{busy?'Сохраняем…':'Подтвердить привязку'}</button>
      <button type="button" disabled={busy} onClick={()=>void review(selected,'REJECT')}>Отклонить</button>
     </div>
    </div>}
   </article>}
  </div>}

  </section>
  <details className="profile-link-advanced-tools" onToggle={e=>{if(e.currentTarget.open)setAdvancedVisited(true)}}>
   <summary>Дополнительные инструменты <small>Архивные email · объединение дублей</small></summary>
   <div className="profile-link-advanced-content">
  <section className="profile-email-coverage" aria-label="Наличие email в исторических профилях">
   <div className="profile-email-coverage-heading"><div><h2>Email исторических участников</h2><p>Подсчёт по реальной базе USD. Учитываются действующие профили без объединённых дублей.</p></div><button type="button" className="secondary-button compact" onClick={()=>void loadCoverage()}>Обновить</button></div>
   {coverageError&&<p role="alert">{coverageError}</p>}
   {!coverage&&!coverageError&&<p role="status">Загружаем статистику…</p>}
   {coverage&&<div className="profile-email-coverage-grid">
    <div><small>Всего профилей</small><strong>{coverage.totalProfiles}</strong></div>
    <div><small>Всего с архивным email</small><strong>{coverage.profilesWithLegacyEmail}</strong></div>
    <div><small>Уже привязаны к аккаунту</small><strong>{coverage.linkedProfiles}</strong></div>
    <div><small>Архивный email есть (без привязки)</small><strong>{coverage.unlinkedWithLegacyEmail}</strong></div>
    <div><small>Без архивного email (без привязки)</small><strong>{coverage.unlinkedWithoutLegacyEmail}</strong></div>
   </div>}
   <div className="profile-email-audit">
    <h3>Сверка по всем таблицам регистраций</h3>
    <p className="muted">Ищем email в сохранённых исходных строках импорта всех этапов и сверяем ФИО с участниками. Восстанавливаем только однозначные совпадения по ФИО и этапу; старые email не заменяем.</p>
    <button type="button" className="secondary-button compact" disabled={emailBusy} onClick={()=>void reconcileEmails(false)}>{emailBusy?'Проверяем…':'Проверить все этапы'}</button>
    {emailError&&<p role="alert">{emailError}</p>}
    {emailAudit&&<div role="status">
     <p><strong>Строк с email:</strong> {emailAudit.rowsWithEmail}. <strong>Найденных соответствий:</strong> {emailAudit.matchedRows}. <strong>Новых email для восстановления:</strong> {emailAudit.safeProfiles}.</p>
     <p><strong>Конфликтных профилей:</strong> {emailAudit.conflictingProfiles}; <strong>тёзок:</strong> {emailAudit.ambiguousRows}; <strong>без совпадения:</strong> {emailAudit.unmatchedRows}; <strong>некорректных адресов:</strong> {emailAudit.invalidEmailRows}.</p>
     {emailAudit.applied&&<p><strong>Добавлено email:</strong> {emailAudit.updatedProfiles??0}. Существующие email не перезаписывались.</p>}
     {!emailAudit.applied&&emailAudit.safeProfiles>0&&<button type="button" className="primary-button" disabled={emailBusy} onClick={()=>void reconcileEmails(true)}>Восстановить {emailAudit.safeProfiles} email</button>}
    </div>}
   </div>
   <p className="muted">Не означает автоматическую привязку: она возможна только при совпадении архивного адреса с подтверждённым email нового аккаунта. Для остальных доступна ручная заявка администратору.</p>
  </section>
  {advancedVisited&&<DuplicateProfilesPreview/>}

   </div>
  </details>
 </PageFrame>;
}
export default ProfileLinksPage;
