import {filterAdminUsers,userHasProfile} from './user-list-filters';
import {AdminListPagination} from './AdminListPagination';
import {paginateResourceRows} from './admin-table-model';
import {AdminEntityLink,useAdminDetail} from './AdminEntityLink';
import {useEditorScroll,useViewState} from './view-state';
import CollapsibleFilters from '../CollapsibleFilters';
import './user-operator-ux.css';
import {PermanentDeletionDialog} from './PermanentDeletionDialog';
import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,ChevronLeft,Plus,RefreshCw,Search} from 'lucide-react';
import {apiGet,apiPatch,apiPost,listData} from '../api';
const profileName=(p:any)=>[p?.lastName,p?.firstName,p?.middleName].filter(Boolean).join(' ')||'Профиль USD';

function UsersPage({PageFrame,ErrorPanel,LoadingPage,EntityForm,EntityDetailModal,formatDate,go}: {PageFrame:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;EntityForm:React.ComponentType<any>;EntityDetailModal:React.ComponentType<any>;formatDate:(value:string)=>string;go:(path:string)=>void}){
 const [deleteId,setDeleteId]=useState(''),[deletionNotice,setDeletionNotice]=useState('');
 const[data,setData]=useState<any[]>([]),[search,setSearch]=useViewState('users:search',''),[role,setRoleFilter]=useViewState('users:role',''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[modal,setModal]=useState<any|null>(null),[detail,setDetail]=useAdminDetail(data),[modalError,setModalError]=useState(''),[saving,setSaving]=useState(false),[availableRoles,setAvailableRoles]=useState<any[]>([]);
 const [roleSaving,setRoleSaving]=useState(false),[pendingRoleChange,setPendingRoleChange]=useState<{userId:string;kind:'system'|'custom';value:string}|null>(null),[notice,setNotice]=useState('');
 const [page,setPage]=useViewState('users:page',1),[pageSize,setPageSize]=useViewState('users:pageSize',10);
 const [emailStatus,setEmailStatus]=useViewState('users:emailStatus','ALL'),[profileStatus,setProfileStatus]=useViewState('users:profileStatus','ALL');
 const [appliedSearch,setAppliedSearch]=useState(search),[appliedRole,setAppliedRole]=useState(role),[loaded,setLoaded]=useState(false);
 const visibleUsers=filterAdminUsers(data,appliedSearch,appliedRole,emailStatus,profileStatus);
 const pagination=paginateResourceRows(visibleUsers,page,pageSize);
 const resetFilters=()=>{setSearch('');setRoleFilter('');setEmailStatus('ALL');setProfileStatus('ALL');setPage(1);void load({search:'',role:''})};
 const requestId=useRef(0);
 useEditorScroll('users',modal!==null||detail!==null,!loading);
 const load=(overrides:{search?:string;role?:string}={})=>{
  const request=++requestId.current;
  const term=(overrides.search??search).trim(),filter=overrides.role??role;
  setLoading(true);setError('');
  // Read the authoritative complete directory once per refresh. All list filters
  // then share the same snapshot, and totals never shrink to a search result.
  return apiGet<any>('/auth/admin/users')
   .then(r=>{if(request===requestId.current){setData(listData(r));setAppliedSearch(term);setAppliedRole(filter);setLoaded(true)}})
   .catch(e=>{if(request===requestId.current)setError(e instanceof Error?e.message:'Ошибка загрузки')})
   .finally(()=>{if(request===requestId.current)setLoading(false)});
 };
 useEffect(()=>{void load()},[role]);
 useEffect(()=>{apiGet<any>('/auth/admin/roles').then(r=>setAvailableRoles(listData<any>(r))).catch(()=>setAvailableRoles([]))},[]);
 const save=async(v:any)=>{
  if(saving)return;
  setSaving(true);setModalError('');
  try{await apiPost('/auth/admin/users',v);setModal(null);setNotice('Пользователь создан');await load()}
  catch(e){setModalError(e instanceof Error?e.message:'Ошибка создания')}
  finally{setSaving(false)}
 };
 const setActive=async(u:any)=>{
  if(roleSaving)return;
  setRoleSaving(true);setError('');setNotice('');
  try{await apiPatch('/auth/admin/users/'+encodeURIComponent(u.id)+'/active',{active:!u.isActive});setNotice('Статус пользователя изменён');await load()}
  catch(e){setError(e instanceof Error?e.message:'Ошибка изменения статуса')}
  finally{setRoleSaving(false)}
 };
 const proposedValue=(u:any,kind:'system'|'custom')=>{
  if(pendingRoleChange&&pendingRoleChange.userId===u.id&&pendingRoleChange.kind===kind)return pendingRoleChange.value;
  return kind==='system'?u.role:u.customRoleId??'';
 };
 const proposeRole=(u:any,kind:'system'|'custom',value:string)=>{
  if(roleSaving)return;
  const saved=kind==='system'?u.role:u.customRoleId??'';
  setPendingRoleChange(value===saved?null:{userId:u.id,kind,value});
  setError('');setNotice('');
 };
 const applyRoleChange=async()=>{
  const pending=pendingRoleChange;
  if(!pending||roleSaving)return;
  const user=data.find(u=>u.id===pending.userId);
  if(!user){setError('Пользователь отсутствует в списке. Обновите страницу.');setPendingRoleChange(null);return}
  setRoleSaving(true);setError('');setNotice('');
  try{
   const endpoint=pending.kind==='system'?'/role':'/custom-role';
   const payload=pending.kind==='system'?{role:pending.value}:{customRoleId:pending.value||null};
   await apiPatch('/auth/admin/users/'+encodeURIComponent(user.id)+endpoint,payload);
   setPendingRoleChange(null);
   setNotice('Права пользователя '+user.email+' сохранены');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Ошибка назначения роли')}
  finally{setRoleSaving(false)}
 };
 return <PageFrame title="Пользователи" subtitle="Учётные записи, роли и доступ к системе" action={modal===null&&!detail?<button className="primary-button compact" onClick={()=>setModal({role:'PARTICIPANT'})}><Plus size={15}/>Создать</button>:undefined}>{deletionNotice&&<p role="status">{deletionNotice}</p>}{notice&&<p className="notice" role="status">{notice}</p>}{deleteId&&<PermanentDeletionDialog kind="user" id={deleteId} onClose={()=>setDeleteId('')} onDeleted={result=>{setDeleteId('');setDetail(null);setDeletionNotice(result.storageCleanupPending?'Профиль удалён. Очистка файлов ещё не завершена; сведения сохранены в журнале.':'Учётная запись удалена. Связанный профиль, если был, удалён; командные публикации сохранены.');void load()}}/>}{modal!==null ? <section className="panel resource-editor-page"><div className="resource-editor-heading"><div><span className="eyebrow">СИСТЕМА · УЧЁТНЫЕ ЗАПИСИ</span><h2>Создать пользователя</h2><p>Создайте аккаунт и назначьте минимально необходимые права. Администратор имеет полный доступ к системе.</p></div><button type="button" className="secondary-button" onClick={()=>{setModal(null);setModalError('')}}><ChevronLeft size={16}/>К списку</button></div>{modalError&&<div className="form-error" role="alert"><AlertTriangle size={16}/><span>{modalError}</span></div>}<EntityForm fields={[{name:'email',label:'Email',type:'email',required:true},{name:'password',label:'Пароль',type:'password',required:true},{name:'role',label:'Роль',options:['ADMIN','PARTICIPANT'],required:true}]} initial={modal} saving={saving} onSubmit={save}/></section> : detail ? <EntityDetailModal inline title="Пользователь" item={detail} columns={[{key:'email',label:'Email'},{key:'role',label:'Роль'},{key:'isActive',label:'Активен'},{key:'emailVerifiedAt',label:'Email подтверждён'},{key:'createdAt',label:'Создан'}]} onClose={()=>setDetail(null)} extra={<><div className="user-linked-participant"><strong>Профиль USD:</strong> {detail.participant?<AdminEntityLink kind="participant" id={detail.participant.id}>{profileName(detail.participant)}</AdminEntityLink>:<span>Не привязан</span>}</div><button className="secondary-button" onClick={()=>{setDetail(null);void setActive(detail)}}>{detail.isActive?'Отключить':'Включить'}</button><button className="danger-button" onClick={()=>setDeleteId(detail.id)}>Удалить профиль навсегда</button></>}/> : <><div className="users-count-summary" role="status" aria-label="Количество пользователей"><div><span>Всего пользователей</span><strong>{loaded?data.length:'—'}</strong></div><div><span>Почта подтверждена</span><strong>{loaded?data.filter(u=>Boolean(u.emailVerifiedAt)).length:'—'}</strong></div><div><span>Профиль привязан</span><strong>{loaded?data.filter(userHasProfile).length:'—'}</strong></div></div><div className="toolbar users-filter-toolbar">
  <div className="search-box"><Search size={15}/><input type="search" aria-label="Поиск пользователей по email" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){setPage(1);void load()}}} placeholder="Email"/>
   {search&&<button type="button" className="usd-admin-search-clear" aria-label="Очистить поиск пользователей" onClick={()=>{setSearch('');setPage(1);void load({search:''})}}>Очистить</button>}
  </div>
  <button type="button" className="primary-button compact" disabled={loading} onClick={()=>{setPage(1);void load()}}>Найти</button>
  <CollapsibleFilters activeCount={Number(Boolean(role))+Number(emailStatus!=='ALL')+Number(profileStatus!=='ALL')}>
   <label>Роль <select className="filter-select" aria-label="Фильтр пользователей по роли" value={role} onChange={e=>{setRoleFilter(e.target.value);setPage(1)}}><option value="">Все роли</option><option value="ADMIN">Администратор</option><option value="PARTICIPANT">Участник</option></select></label>
   <label>Подтверждение почты<select aria-label="Фильтр подтверждения почты" value={emailStatus} onChange={e=>{setEmailStatus(e.target.value);setPage(1)}}><option value="ALL">Любое подтверждение</option><option value="VERIFIED">Подтверждена</option><option value="UNVERIFIED">Не подтверждена</option></select></label>
   <label>Привязка профиля<select aria-label="Фильтр привязки профиля" value={profileStatus} onChange={e=>{setProfileStatus(e.target.value);setPage(1)}}><option value="ALL">Любая привязка</option><option value="LINKED">Профиль привязан</option><option value="UNLINKED">Профиль не привязан</option></select></label>
  </CollapsibleFilters>
  <button type="button" className="secondary-button compact" aria-label="Обновить список пользователей" disabled={loading} onClick={()=>void load()}><RefreshCw size={14}/></button>
  {(search||role||emailStatus!=='ALL'||profileStatus!=='ALL')&&<button type="button" className="secondary-button compact" onClick={resetFilters}>Сбросить фильтры пользователей</button>}
  <span className="row-count" role="status">Найдено {loading?'…':visibleUsers.length} из {loaded?data.length:'—'}</span>
 </div>{visibleUsers.length>10&&<AdminListPagination label="пользователей" total={visibleUsers.length} page={pagination.page} pageCount={pagination.pageCount} pageSize={pagination.pageSize} onPageChange={next=>{setPendingRoleChange(null);setPage(next)}} onPageSizeChange={size=>{setPageSize(size);setPage(1)}}/>}{error&&<ErrorPanel message={error} retry={load}/>}<div className="panel table-wrap">{loading?<LoadingPage small/>:visibleUsers.length===0?<div className="usd-admin-filter-empty"><p>Пользователи не найдены. Измените поиск или фильтр.</p><button type="button" className="secondary-button compact" onClick={resetFilters}>Сбросить поиск и фильтры</button></div>:<table className="data-table"><thead><tr><th>Email</th><th>Профиль USD</th><th>Роль</th><th>Статус</th><th>Подтверждение</th><th>Создан</th><th/></tr></thead><tbody>{pagination.rows.map(u=><tr key={u.id} className="clickable-row" tabIndex={0} aria-label={'Открыть пользователя '+u.email} onClick={()=>setDetail(u)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setDetail(u)}}}><td data-label="Email">{u.email}</td><td data-label="Профиль USD">{u.participant?<AdminEntityLink kind="participant" id={u.participant.id}>{profileName(u.participant)}</AdminEntityLink>:<span className="muted">Не привязан</span>}</td><td data-label="Роль"><div className="user-role-controls" onClick={e=>e.stopPropagation()}>
  <select className="inline-select" aria-label={'Системная роль '+u.email} value={proposedValue(u,'system')} disabled={roleSaving} onChange={e=>proposeRole(u,'system',e.target.value)}><option value="ADMIN">Администратор</option><option value="PARTICIPANT">Участник</option></select>
  <select className="inline-select" aria-label={'Пользовательская роль '+u.email} value={proposedValue(u,'custom')} disabled={roleSaving} onChange={e=>proposeRole(u,'custom',e.target.value)}><option value="">Без пользовательской роли</option>{availableRoles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
  {u.customRole&&<small>Дополнительная роль: {u.customRole.name}</small>}
  {pendingRoleChange&&pendingRoleChange.userId===u.id&&<div className="user-role-confirmation" role="group" aria-label={'Изменение роли пользователя '+u.email}>
   <p>{pendingRoleChange.kind==='system'
    ?pendingRoleChange.value==='ADMIN'?'Администратор получит полный доступ к системе USD.':'Административные права будут отозваны.'
    :'Пользовательские права доступа будут изменены.'}</p>
   <div className="user-role-confirmation-actions">
    <button type="button" className="primary-button compact" disabled={roleSaving} onClick={()=>void applyRoleChange()}>{roleSaving?'Сохраняем…':'Подтвердить изменение роли'}</button>
    <button type="button" className="secondary-button compact" disabled={roleSaving} onClick={()=>setPendingRoleChange(null)}>Отмена</button>
   </div>
  </div>}
 </div></td><td data-label="Статус"><span className={`badge ${u.isActive?'good':''}`}>{u.isActive?'Активен':'Отключён'}</span></td><td data-label="Подтверждение">{u.emailVerifiedAt?'Да':'Нет'}</td><td data-label="Создан">{formatDate(u.createdAt)}</td><td data-label="Действия" className="row-actions" onClick={e=>e.stopPropagation()}><button className="secondary-button compact" type="button" disabled={roleSaving} aria-label={'Изменить статус пользователя '+u.email} onClick={()=>void setActive(u)}>{u.isActive?'Отключить':'Включить'}</button></td></tr>)}</tbody></table>}</div></>}</PageFrame>
}

export default UsersPage;
