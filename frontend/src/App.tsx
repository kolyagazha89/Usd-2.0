import {useEffect,useMemo,useState} from 'react';
import {Activity,AlertTriangle,BarChart3,Bell,CalendarDays,CarFront,Check,ChevronRight,ClipboardCheck,Database,FileClock,FileInput,Flag,Gauge,History,LayoutDashboard,Loader2,LogOut,Menu,Plus,RefreshCw,Search,Settings2,ShieldAlert,Trophy,UserRound,Users,X} from 'lucide-react';
import {apiDelete,apiGet,apiPatch,apiPost,apiPut,getAudit,getDashboard,getDataQuality,connectGoogle,getGoogleSheetValues,getGoogleSpreadsheet,getGoogleSpreadsheets,getGoogleStatus,listData,login,logout,refresh,getSiteSettings,updateSiteSettings,findHistoricalProfileCandidates,linkHistoricalProfile,type Dashboard,type Role,type User} from './api';

const nav=[
 {label:'Dashboard',path:'/admin',icon:LayoutDashboard,roles:['ADMIN','JUDGE']},
 {label:'Участники',path:'/admin/participants',icon:Users,roles:['ADMIN']},
 {label:'Автомобили',path:'/admin/cars',icon:CarFront,roles:['ADMIN']},
 {label:'Сезоны',path:'/admin/seasons',icon:CalendarDays,roles:['ADMIN']},
 {label:'Этапы',path:'/admin/stages',icon:Flag,roles:['ADMIN','JUDGE']},
 {label:'Классы',path:'/admin/classes',icon:Gauge,roles:['ADMIN']},
 {label:'Регистрации',path:'/admin/registrations',icon:ClipboardCheck,roles:['ADMIN','JUDGE']},
 {label:'Инспекции',path:'/admin/inspections',icon:ShieldAlert,roles:['ADMIN','JUDGE']},
 {label:'Результаты',path:'/admin/results',icon:Trophy,roles:['ADMIN','JUDGE']},
 {label:'Дисквалификации',path:'/admin/disqualifications',icon:AlertTriangle,roles:['ADMIN']},
 {label:'История результатов',path:'/admin/historical-results',icon:History,roles:['ADMIN']},
 {label:'Импорт',path:'/admin/import',icon:FileInput,roles:['ADMIN']},
 {label:'Рекорды',path:'/admin/records',icon:Trophy,roles:['ADMIN','JUDGE']},
 {label:'Статистика',path:'/admin/statistics',icon:BarChart3,roles:['ADMIN','JUDGE']},
 {label:'Пользователи',path:'/admin/users',icon:UserRound,roles:['ADMIN']},
 {label:'Аудит',path:'/admin/audit',icon:FileClock,roles:['ADMIN']},
 {label:'Контроль данных',path:'/admin/data-quality',icon:Database,roles:['ADMIN']},
 {label:'Настройки сайта',path:'/admin/site-settings',icon:Settings2,roles:['ADMIN']},
];
const roleName:Record<Role,string>={ADMIN:'Администратор',JUDGE:'Судья',PARTICIPANT:'Участник'};

function App(){
 const[user,setUser]=useState<User|null>(null),[booting,setBooting]=useState(true),[path,setPath]=useState(location.pathname),[mobileOpen,setMobileOpen]=useState(false);
 useEffect(()=>{refresh().then(r=>setUser(r?.user??null)).finally(()=>setBooting(false));const f=()=>setPath(location.pathname);addEventListener('popstate',f);return()=>removeEventListener('popstate',f)},[]);
 const go=(p:string)=>{history.pushState({},'',p);setPath(p);setMobileOpen(false)};
 if(booting)return <Splash/>;
 if(!user)return <LoginScreen onLogin={async(e,p)=>setUser(await login(e,p))}/>;
 if(user.role==='PARTICIPANT')return <ParticipantPortal user={user} onUserChange={setUser} onLogout={async()=>{await logout();setUser(null)}}/>;
 return <Shell user={user} path={path} go={go} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} onLogout={async()=>{await logout();setUser(null);go('/')}}/>;
}
function Splash(){return <div className="splash"><div className="brand-mark">USD</div><div className="loader"/></div>}
function LoginScreen({onLogin}:{onLogin:(e:string,p:string)=>Promise<void>}){const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);return <div className="login-page"><div className="login-grid"/><div className="login-card"><div className="brand-lockup"><div className="brand-mark">USD</div><span>2.0</span></div><div className="eyebrow">Competition Management System</div><h1>С возвращением</h1><p className="muted">Войдите в административную панель USD.</p><form className="form" onSubmit={async e=>{e.preventDefault();setError('');setLoading(true);try{await onLogin(email,password)}catch(x){setError(x instanceof Error?x.message:'Не удалось выполнить вход')}finally{setLoading(false)}}}><label>Email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="username" required/></label><label>Пароль<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required/></label>{error&&<div className="form-error"><AlertTriangle size={16}/>{error}</div>}<button className="primary-button" disabled={loading}>{loading?'Входим…':'Войти'}<ChevronRight size={18}/></button></form><div className="login-footer"><span>USD Russia</span><span>Secure access</span></div></div></div>}
function ParticipantPortal({user,onUserChange,onLogout}:{user:User;onUserChange:(u:User)=>void;onLogout:()=>Promise<void>}){
 const[name,setName]=useState(''),[candidates,setCandidates]=useState<any[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const search=async()=>{setError('');setLoading(true);try{const r=await findHistoricalProfileCandidates(name);setCandidates(r.candidates??[])}catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить поиск')}finally{setLoading(false)}};
 const link=async(id:string)=>{setError('');setLoading(true);try{await linkHistoricalProfile(id);const r=await refresh();if(r?.user)onUserChange(r.user)}catch(e){setError(e instanceof Error?e.message:'Не удалось привязать профиль')}finally{setLoading(false)}};
 const create=async()=>{const parts=name.trim().split(/\\s+/).filter(Boolean);if(parts.length<2){setError('Укажите минимум фамилию и имя');return}setLoading(true);try{await apiPost('/participants/me',{lastName:parts[0],firstName:parts[1],middleName:parts.slice(2).join(' ')||null,isPublic:true});const r=await refresh();if(r?.user)onUserChange(r.user)}catch(e){setError(e instanceof Error?e.message:'Не удалось создать профиль')}finally{setLoading(false)}};
 if(user.participantId)return <div className="center-page"><div className="empty-card"><div className="brand-mark">USD</div><h2>Личный кабинет участника</h2><p className="muted">Профиль привязан. Здесь будет ваша история выступлений, автомобили и регистрации.</p><button className="secondary-button" onClick={()=>void onLogout()}>Выйти</button></div></div>;
 return <div className="center-page"><div className="empty-card participant-match-card"><div className="brand-mark">USD</div><div className="eyebrow">Личный кабинет участника</div><h2>Найти вашу историю USD</h2><p className="muted">Если вы уже участвовали в USD, мы найдём исторический профиль и предложим связать его с вашим аккаунтом.</p><label>Фамилия, имя и отчество<input value={name} onChange={e=>setName(e.target.value)} placeholder="Иванов Иван Иванович" autoComplete="name"/></label><button className="primary-button" onClick={()=>void search()} disabled={loading||name.trim().length<3}>{loading?'Ищем…':'Найти мою историю'}<ChevronRight size={18}/></button>{error&&<div className="form-error"><AlertTriangle size={16}/>{error}</div>}{candidates.map((c:any)=><div className="historical-match-card" key={c.id}><div><strong>{[c.lastName,c.firstName,c.middleName].filter(Boolean).join(' ')}</strong><span>{[c.team,c.city].filter(Boolean).join(' · ')||'Исторический участник'}</span><small>{c._count?.registrations??0} выступлений</small></div><button className="primary-button compact" onClick={()=>void link(c.id)} disabled={loading}>Да, это я</button></div>)}{!loading&&name.trim().length>=3&&candidates.length===0&&<><p className="muted">Совпадений не найдено.</p><button className="secondary-button" onClick={()=>void create()}>Создать новый профиль</button></>}<button className="text-button" onClick={()=>void onLogout()}>Выйти</button></div></div>;
}

function AccessDenied({onLogout}:{onLogout:()=>Promise<void>}){return <div className="center-page"><div className="empty-card"><ShieldAlert size={36}/><h2>Нет доступа к панели</h2><p className="muted">Учётная запись участника не имеет доступа к Admin Panel.</p><button className="secondary-button" onClick={()=>void onLogout()}>Выйти</button></div></div>}

function Shell({user,path,go,mobileOpen,setMobileOpen,onLogout}:{user:User;path:string;go:(p:string)=>void;mobileOpen:boolean;setMobileOpen:(v:boolean)=>void;onLogout:()=>Promise<void>}){
 const visible=useMemo(()=>nav.filter(n=>n.roles.includes(user.role)),[user.role]),active=visible.find(n=>path===n.path||(n.path!=='/admin'&&path.startsWith(n.path)));
 const[fieldMode,setFieldMode]=useState(()=>localStorage.getItem('usd.fieldMode')==='1');
 const[searchOpen,setSearchOpen]=useState(false);
 useEffect(()=>{localStorage.setItem('usd.fieldMode',fieldMode?'1':'0');document.documentElement.classList.toggle('field-mode',fieldMode);return()=>document.documentElement.classList.remove('field-mode')},[fieldMode]);
 useEffect(()=>{const h=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(true)}if(e.key==='Escape')setSearchOpen(false)};addEventListener('keydown',h);return()=>removeEventListener('keydown',h)},[]);
 return <div className="app-shell"><aside className={`sidebar ${mobileOpen?'open':''}`}><div className="sidebar-top"><button className="brand-button" onClick={()=>go('/admin')}><span className="brand-mark small">USD</span><span className="brand-title">USD <b>2.0</b></span></button><button className="icon-button mobile-close" onClick={()=>setMobileOpen(false)}><X size={19}/></button></div><div className="sidebar-label">Управление</div><nav>{visible.map(n=>{const I=n.icon;return <button key={n.path} className={`nav-item ${active?.path===n.path?'active':''}`} onClick={()=>go(n.path)}><I size={18}/><span>{n.label}</span>{active?.path===n.path&&<span className="nav-dot"/>}</button>})}</nav><div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{(user.name??user.email).slice(0,1).toUpperCase()}</div><div><strong>{user.name||'Пользователь'}</strong><small>{roleName[user.role]}</small></div></div><button className="logout-button" onClick={()=>void onLogout()}><LogOut size={17}/>Выйти</button></div></aside>{mobileOpen&&<button className="mobile-backdrop" onClick={()=>setMobileOpen(false)}/>}<main className="main"><header className="topbar"><button className="icon-button menu-button" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><button className="global-search-trigger" onClick={()=>setSearchOpen(true)}><Search size={15}/><span>Быстрый поиск</span><kbd>Ctrl K</kbd></button><div className="breadcrumb"><span>USD 2.0</span><ChevronRight size={14}/><strong>{active?.label??'Панель'}</strong></div><div className="topbar-actions"><button className={`field-status ${fieldMode?'active':''}`} title="Режим для работы на площадке: крупнее элементы, меньше второстепенных деталей" onClick={()=>setFieldMode(v=>!v)}><span className="field-status-dot"/>{fieldMode?'ПОЛЕВОЙ РЕЖИМ ON':'ПОЛЕВОЙ РЕЖИМ'}</button><div className="role-pill">{user.role==='JUDGE'?'JUDGE':'ADMIN'}</div><button className="topbar-refresh" title="Обновить страницу" onClick={()=>window.location.reload()}><RefreshCw size={16}/></button></div></header><div className="content"><Page path={path} go={go} user={user}/></div></main>{searchOpen&&<GlobalSearch onClose={()=>setSearchOpen(false)} go={go}/>}</div>
}

function Page({path,go,user}:{path:string;go:(p:string)=>void;user:User}){
 if(path==='/admin'||path==='/admin/')return <DashboardPage go={go}/>;
 if(path.startsWith('/admin/participants'))return <ParticipantsPage go={go}/>;
 if(path.startsWith('/admin/cars'))return <CarsPage user={user}/>;
 if(path.startsWith('/admin/seasons'))return <SeasonsPage/>;
 if(path.startsWith('/admin/stages'))return <StagesPage go={go} user={user}/>;
 if(path.startsWith('/admin/classes'))return <ClassesPage/>;
 if(path.startsWith('/admin/registrations'))return <RegistrationsPage/>;
 if(path.startsWith('/admin/inspections'))return <InspectionsPage user={user}/>;
 if(path.startsWith('/admin/results'))return <ResultsPage user={user}/>;
 if(path.startsWith('/admin/disqualifications'))return <DisqualificationsPage/>;
 if(path.startsWith('/admin/historical-results'))return <HistoricalPage/>;
 if(path.startsWith('/admin/import'))return <ImportPage/>;
 if(path.startsWith('/admin/records'))return <RecordsPage/>;
 if(path.startsWith('/admin/statistics'))return <StatisticsPage/>;
 if(path.startsWith('/admin/users'))return <UsersPage/>;
 if(path.startsWith('/admin/audit'))return <AuditPage/>;
 if(path.startsWith('/admin/data-quality'))return <QualityPage/>;
 if(path.startsWith('/admin/site-settings'))return <SiteSettingsPage/>;
 return <Coming title="Пользователи" icon={UserRound} user={user}/>;
}

function DashboardPage({go}:{go:(p:string)=>void}){
 const[data,setData]=useState<Dashboard|null>(null),[error,setError]=useState('');
 const load=()=>{setError('');return getDashboard().then(setData).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки'));};
 useEffect(()=>{void load()},[]);
 if(error)return <ErrorPanel message={error} retry={load}/>;
 if(!data)return <LoadingPage/>;
 const stage=data.currentStage,regs=data.activeRegistrationStats,a=data.attention,ov=data.overview;
 const hasAlerts=a.failedInspections>0||a.unresolvedImports>0||a.activeDisqualifications>0||a.openStages===0;
 return <PageFrame title="Dashboard" subtitle="Операционный центр USD 2.0" action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
  <section className="dashboard-kpis">
   <button className="dashboard-kpi" onClick={()=>go('/admin/participants')}><span><Users size={16}/>Участники</span><strong>{ov.participants.toLocaleString('ru-RU')}</strong><small>в базе</small></button>
   <button className="dashboard-kpi" onClick={()=>go('/admin/cars')}><span><CarFront size={16}/>Автомобили</span><strong>{ov.cars.toLocaleString('ru-RU')}</strong><small>активных</small></button>
   <button className="dashboard-kpi" onClick={()=>go('/admin/registrations')}><span><ClipboardCheck size={16}/>Регистрации</span><strong>{regs.registrations.toLocaleString('ru-RU')}</strong><small>{regs.participants} участников · {regs.cars} авто</small></button>
   <button className="dashboard-kpi" onClick={()=>go('/admin/results')}><span><Trophy size={16}/>Результаты</span><strong>{(ov.appearances??ov.results??0).toLocaleString('ru-RU')}</strong><small>учтённых выступлений</small></button>
  </section>
  <section className="dashboard-main-grid">
   <div className="panel dashboard-stage-card">
    <PanelTitle title={stage?'Рабочий этап':'Ближайший этап'} icon={Flag} action="Открыть этапы" onAction={()=>go('/admin/stages')}/>
    {stage?<button className="dashboard-feature" onClick={()=>go('/admin/stages')}>
      <div className="stage-number large">{stage.stageNumber}</div>
      <div className="stage-main"><strong>{stage.name}</strong><span>{stage.city||'—'} · {formatDate(stage.date)}</span><small><span className={'status '+(stage.registrationOpen?'open':'')}>{stage.registrationOpen?'Регистрация открыта':'Регистрация закрыта'}</span> · {stage.status}</small></div>
      <ChevronRight size={20}/>
    </button>:<Empty text="Будущих этапов пока нет"/>}
   </div>
   <div className="panel dashboard-command-panel">
    <PanelTitle title="Быстрые действия" icon={Activity}/>
    <div className="dashboard-actions">
     <button onClick={()=>go('/admin/stages')}><Plus size={17}/><span>Создать этап</span></button>
     <button onClick={()=>go('/admin/participants')}><UserRound size={17}/><span>Новый участник</span></button>
     <button onClick={()=>go('/admin/inspections')}><ShieldAlert size={17}/><span>Инспекция</span></button>
     <button onClick={()=>go('/admin/results')}><Trophy size={17}/><span>Внести результат</span></button>
     <button onClick={()=>go('/admin/import')}><FileInput size={17}/><span>Импорт</span></button>
     <button onClick={()=>go('/admin/registrations')}><ClipboardCheck size={17}/><span>Регистрации</span></button>
    </div>
   </div>
  </section>
  <section className="dashboard-alert-grid">
   <button className={'dashboard-alert '+(a.pendingInspections?'attention':'')} onClick={()=>go('/admin/inspections')}><div><ShieldAlert size={20}/><span>Инспекции</span></div><strong>{a.pendingInspections}</strong><small>{a.pendingInspections?'ожидают проверки':'все проверены'}</small></button>
   <button className={'dashboard-alert '+(a.failedInspections?'danger':'')} onClick={()=>go('/admin/inspections')}><div><AlertTriangle size={20}/><span>Проблемные инспекции</span></div><strong>{a.failedInspections}</strong><small>{a.failedInspections?'требуют внимания':'нарушений не найдено'}</small></button>
   <button className={'dashboard-alert '+(a.unresolvedImports?'danger':'')} onClick={()=>go('/admin/import')}><div><FileInput size={20}/><span>Импорт</span></div><strong>{a.unresolvedImports}</strong><small>{a.unresolvedImports?'загрузок с предупреждениями':'очередь чистая'}</small></button>
   <button className={'dashboard-alert '+(a.activeDisqualifications?'attention':'')} onClick={()=>go('/admin/disqualifications')}><div><AlertTriangle size={20}/><span>Дисквалификации</span></div><strong>{a.activeDisqualifications}</strong><small>{a.activeDisqualifications?'активных':'активных нет'}</small></button>
  </section>
  <section className="dashboard-lower-grid">
   <div className="panel"><PanelTitle title="Ближайшие этапы" icon={CalendarDays} action="Все" onAction={()=>go('/admin/stages')}/>{data.upcomingStages.length?data.upcomingStages.map(s=><button className="stage-row" key={s.id} onClick={()=>go('/admin/stages')}><div className="stage-number">{s.stageNumber}</div><div className="stage-main"><strong>{s.name}</strong><span>{s.city||'—'} · {formatDate(s.date)}</span></div><span className={'status '+(s.registrationOpen?'open':'')}>{s.registrationOpen?'Открыта':'Закрыта'}</span><ChevronRight size={16}/></button>):<Empty text="Нет запланированных этапов"/>}</div>
   <div className="panel"><PanelTitle title="Последние этапы" icon={History} action="Все" onAction={()=>go('/admin/stages')}/>{data.recentStages.length?data.recentStages.map(s=><button className="stage-row" key={s.id} onClick={()=>go('/admin/stages')}><div className="stage-number">{s.stageNumber}</div><div className="stage-main"><strong>{s.name}</strong><span>{s.city||'—'} · {formatDate(s.date)}</span></div><ChevronRight size={16}/></button>):<Empty text="История этапов пока пуста"/>}</div>
  </section>
  <section className="dashboard-system panel">
   <div className="dashboard-system-head"><div><strong>Состояние системы</strong><span>{hasAlerts?'Есть пункты, требующие внимания':'Критичных пунктов нет'}</span></div><span className={'system-status '+(hasAlerts?'warning':'good')}>{hasAlerts?'ТРЕБУЕТ ВНИМАНИЯ':'ВСЁ В ПОРЯДКЕ'}</span></div>
   <div className="dashboard-system-grid">
    <button onClick={()=>go('/admin/stages')}><span>Открытые этапы</span><strong>{a.openStages}</strong></button>
    <button onClick={()=>go('/admin/results')}><span>Результаты сегодня</span><strong>{a.resultsToday}</strong></button>
    <button onClick={()=>go('/admin/records')}><span>Текущие рекорды</span><strong>{ov.currentRecords}</strong></button>
    <button onClick={()=>go('/admin/data-quality')}><span>Контроль данных</span><strong>Открыть</strong></button>
   </div>
  </section>
 </PageFrame>
}
function StageMini({title,items,go}:{title:string;items:any[];go:(p:string)=>void}){return <div className="panel"><PanelTitle title={title} icon={CalendarDays} action="Все этапы" onAction={()=>go('/admin/stages')}/>{items.length?items.map(s=><button className="stage-row" key={s.id} onClick={()=>go('/admin/stages')}><div className="stage-number">{s.stageNumber}</div><div className="stage-main"><strong>{s.name}</strong><span>{s.city||'—'} · {formatDate(s.date)}</span></div>{s.registrationOpen!==undefined&&<span className={`status ${s.registrationOpen?'open':''}`}>{s.registrationOpen?'Открыта':'Закрыта'}</span>}<ChevronRight size={16}/></button>):<Empty text="Нет данных"/>}</div>}

type Field={name:string;label:string;type?:string;required?:boolean;options?:string[];optionsPath?:string;optionLabel?:(item:any)=>string};
function ResourcePage({title,subtitle,path,columns,fields,create,update,remove,searchPlaceholder='Поиск'}:{title:string;subtitle:string;path:string;columns:{key:string;label:string}[];fields?:Field[];create?:(v:any)=>Promise<any>;update?:(id:string,v:any)=>Promise<any>;remove?:(id:string)=>Promise<any>;searchPlaceholder?:string}){
 const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[modal,setModal]=useState<any|null>(null),[saving,setSaving]=useState(false),[relationOptions,setRelationOptions]=useState<Record<string,any[]>>({});
 const load=()=>{setLoading(true);return apiGet<any>(path).then(r=>setData(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки')).finally(()=>setLoading(false))};useEffect(()=>{void load()},[path]);
 useEffect(()=>{let cancelled=false;const relationFields=(fields??[]).filter(f=>f.optionsPath);if(!relationFields.length)return;Promise.all(relationFields.map(async f=>{try{const r=await apiGet<any>(f.optionsPath!);return [f.name,listData(r)] as const}catch{return [f.name,[]] as const}})).then(entries=>{if(!cancelled)setRelationOptions(Object.fromEntries(entries))});return()=>{cancelled=true}},[fields]);
 const filtered=data.filter(x=>JSON.stringify(x).toLowerCase().includes(search.toLowerCase()));
 const submit=async(v:any)=>{setSaving(true);try{if(modal?.id&&update)await update(modal.id,v);else if(create)await create(v);setModal(null);await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения')}finally{setSaving(false)}};
 return <PageFrame title={title} subtitle={subtitle} action={<>{fields&&create&&<button className="primary-button compact" onClick={()=>setModal({})}><Plus size={15}/>Добавить</button>}<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/></button></>}><div className="toolbar"><div className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={searchPlaceholder}/></div><span className="row-count">{filtered.length} записей</span></div>{error&&<ErrorPanel message={error} retry={load}/>}<div className="panel table-wrap">{loading?<LoadingPage small/>:<DataTable rows={filtered} columns={columns} onEdit={update?setModal:undefined} onDelete={remove?async id=>{if(confirm('Удалить запись?')){await remove(id);await load()}}:undefined}/>}</div>{modal!==null&&<Modal title={modal.id?'Редактирование':'Новая запись'} onClose={()=>setModal(null)}><EntityForm fields={fields??[]} initial={modal} saving={saving} relationOptions={relationOptions} onSubmit={submit}/></Modal>}</PageFrame>
}

function ParticipantsPage({go}:{go:(p:string)=>void}){return <ResourcePage title="Участники" subtitle="Профили, команды и история выступлений" path="/admin/participants" columns={[{key:'lastName',label:'Фамилия'},{key:'firstName',label:'Имя'},{key:'city',label:'Город'},{key:'team',label:'Команда'},{key:'phone',label:'Телефон'},{key:'isPublic',label:'Публичный'}]} fields={[{name:'lastName',label:'Фамилия',required:true},{name:'firstName',label:'Имя',required:true},{name:'middleName',label:'Отчество'},{name:'city',label:'Город'},{name:'team',label:'Команда'},{name:'phone',label:'Телефон'},{name:'birthDate',label:'Дата рождения',type:'date'},{name:'isPublic',label:'Показывать профиль публично',type:'checkbox'}]} create={v=>apiPost('/participants',v)} update={(id,v)=>apiPatch('/participants/'+id,v)} remove={id=>apiDelete('/participants/'+id)} searchPlaceholder="ФИО, город, команда"/>}

function CarsPage({user}:{user:User}){
 const canEdit=user.role==='ADMIN';
 const [cars,setCars]=useState<any[]>([]),[participants,setParticipants]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[modal,setModal]=useState<any|null>(null),[configCar,setConfigCar]=useState<any|null>(null),[saving,setSaving]=useState(false);
 const load=async()=>{setLoading(true);setError('');try{setCars(listData(await apiGet<any>('/cars')))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки автомобилей')}finally{setLoading(false)}};
 useEffect(()=>{void load();apiGet<any>('/admin/participants').then(r=>setParticipants(listData(r))).catch(()=>{})},[]);
 const saveCar=async(v:any)=>{setSaving(true);try{if(modal?.id)await apiPatch('/cars/'+modal.id,v);else await apiPost('/participants/'+v.participantId+'/cars',v);setModal(null);await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения автомобиля')}finally{setSaving(false)}};
 const removeCar=async(id:string)=>{if(!window.confirm('Деактивировать автомобиль?'))return;try{await apiDelete('/cars/'+id);await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка деактивации')}};
 const filtered=cars.filter(c=>{const q=search.trim().toLowerCase();if(!q)return true;return [c.brand,c.model,c.registrationNumber,c.registrationCountry,c.color,c.participant?.lastName,c.participant?.firstName,c.participant?.team].filter(Boolean).join(' ').toLowerCase().includes(q)});
 const countries=['RU','NO','FI','EE','LV','LT','PL','BY','UA','GE','AZ','KZ','CN','MN','KP','US'];
 return <PageFrame title="Автомобили" subtitle="Автомобили участников и их конфигурации" action={canEdit?<button className="primary-button compact" onClick={()=>setModal({})}><Plus size={15}/>Добавить автомобиль</button>:undefined}>
  <div className="toolbar"><div className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Марка, модель, госномер, участник"/></div><button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/></button><span className="row-count">{filtered.length} автомобилей</span></div>
  {error&&<div className="notice"><AlertTriangle size={18}/><span>{error}</span></div>}
  <div className="panel table-wrap">{loading?<LoadingPage small/>:<>{filtered.length?<table className="data-table"><thead><tr><th>Автомобиль</th><th>Участник</th><th>Госномер</th><th>Цвет</th><th>Конфигурации</th><th>Статус</th><th/></tr></thead><tbody>{filtered.map(car=><tr key={car.id}><td><strong>{car.brand} {car.model}</strong></td><td>{car.participant?[car.participant.lastName,car.participant.firstName].filter(Boolean).join(' '):'—'}</td><td>{car.registrationCountry} · {car.registrationNumber}</td><td>{car.color||'—'}</td><td><button className="text-button" onClick={()=>setConfigCar(car)}>{car.configurations?.length??0} конф.</button></td><td><span className={"badge "+(car.isActive?'good':'')}>{car.isActive?'Активен':'Неактивен'}</span></td><td className="row-actions">{canEdit&&<><button className="icon-button" title="Изменить" onClick={()=>setModal(car)}>✎</button>{car.isActive&&<button className="icon-button danger" title="Деактивировать" onClick={()=>void removeCar(car.id)}>×</button>}</>}</td></tr>)}</tbody></table>:<Empty text="Автомобилей пока нет"/>}</>}</div>
  {modal!==null&&<CarModal value={modal} participants={participants} countries={countries} saving={saving} onClose={()=>setModal(null)} onSubmit={saveCar}/>}
  {configCar&&<ConfigurationsModal car={configCar} canEdit={canEdit} onClose={()=>setConfigCar(null)}/>}
 </PageFrame>
}

function CarModal({value,participants,countries,saving,onClose,onSubmit}:{value:any;participants:any[];countries:string[];saving:boolean;onClose:()=>void;onSubmit:(v:any)=>Promise<void>}){
 const [v,setV]=useState<any>({participantId:value.participantId??'',brand:value.brand??'',model:value.model??'',registrationCountry:value.registrationCountry??'RU',registrationNumber:value.registrationNumber??'',color:value.color??'',isPublic:value.isPublic??true});
 const name=(p:any)=>[p.lastName,p.firstName,p.middleName].filter(Boolean).join(' ');
 return <Modal title={value.id?'Редактировать автомобиль':'Новый автомобиль'} onClose={onClose}><form className="form modal-form" onSubmit={e=>{e.preventDefault();void onSubmit(clean(v))}}>
 {!value.id&&<label>Участник<select value={v.participantId} onChange={e=>setV({...v,participantId:e.target.value})} required><option value="">Выберите участника</option>{participants.map(p=><option key={p.id} value={p.id}>{name(p)}{p.team?' · '+p.team:''}</option>)}</select></label>}
 <div className="form-grid-2"><label>Марка<input value={v.brand} onChange={e=>setV({...v,brand:e.target.value})} required/></label><label>Модель<input value={v.model} onChange={e=>setV({...v,model:e.target.value})} required/></label></div>
 <div className="form-grid-2"><label>Страна регистрации<select value={v.registrationCountry} onChange={e=>setV({...v,registrationCountry:e.target.value})}>{countries.map(x=><option key={x}>{x}</option>)}</select></label><label>Госномер<input value={v.registrationNumber} onChange={e=>setV({...v,registrationNumber:e.target.value.toUpperCase()})} required/></label></div>
 <label>Цвет<input value={v.color} onChange={e=>setV({...v,color:e.target.value})}/></label><label className="checkbox-row"><input type="checkbox" checked={!!v.isPublic} onChange={e=>setV({...v,isPublic:e.target.checked})}/>Показывать автомобиль публично</label>
 <button className="primary-button" disabled={saving}>{saving?<><Loader2 className="spin" size={15}/>Сохраняем…</>:'Сохранить автомобиль'}</button>
 </form></Modal>
}

function ConfigurationsModal({car,canEdit,onClose}:{car:any;canEdit:boolean;onClose:()=>void}){
 const [configs,setConfigs]=useState<any[]>(car.configurations??[]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[editing,setEditing]=useState<any|null>(null),[details,setDetails]=useState<any|null>(null);
 const load=async()=>{setLoading(true);try{setConfigs(listData(await apiGet<any>('/cars/'+car.id+'/configurations')))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки конфигураций')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[car.id]);
 const open=async(id:string)=>{try{setDetails(await apiGet<any>('/configurations/'+id))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки конфигурации')}};
 return <Modal title={'Конфигурации · '+car.brand+' '+car.model} onClose={onClose}>
  {error&&<div className="notice"><AlertTriangle size={16}/>{error}</div>}
  {loading?<LoadingPage small/>:<><div className="config-list">{!configs.length&&<Empty text="Конфигураций пока нет"/>}{configs.map(c=><div className="config-card" key={c.id}><div><strong>{c.name}</strong><span>Текущая версия: v{c.currentVersion}</span></div><div className="row-actions"><button className="secondary-button compact" onClick={()=>void open(c.id)}>Открыть</button>{canEdit&&<button className="secondary-button compact" onClick={()=>setEditing(c)}>Новая версия</button>}</div></div>)}</div><button className="primary-button" onClick={()=>setEditing({})}><Plus size={15}/>Создать конфигурацию</button></>}
  {editing!==null&&<ConfigurationEditor carId={car.id} configuration={editing} onClose={()=>setEditing(null)} onSaved={async()=>{setEditing(null);await load()}}/>}
  {details&&<ConfigurationDetails configuration={details} onClose={()=>setDetails(null)} onEdit={canEdit?()=>{setDetails(null);setEditing(details)}:undefined}/>}
 </Modal>
}

function ConfigurationEditor({carId,configuration,onClose,onSaved}:{carId:string;configuration:any;onClose:()=>void;onSaved:()=>Promise<void>}){
 const isNew=!configuration.id,initial=configuration.versions?.find((x:any)=>x.version===configuration.currentVersion)||configuration.versions?.[0]||{};
 const [v,setV]=useState<any>({name:configuration.name??'',vibrationIsolation:initial.vibrationIsolation??'',additionalDescription:initial.additionalDescription??'',headUnits:(initial.headUnits??[]).map((x:any)=>({...x})),audioComponents:(initial.audioComponents??[]).map((x:any)=>({...x})),amplifiers:(initial.amplifiers??[]).map((x:any)=>({...x,componentLinks:(x.componentLinks??[]).map((l:any)=>({...l,componentId:String((initial.audioComponents??[]).findIndex((ac:any)=>ac.id===l.componentId))}))})),batteries:(initial.batteries??[]).map((x:any)=>({...x})),generators:(initial.generators??[]).map((x:any)=>({...x}))});
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const directions=['FRONT','REAR','SUB'],types=['SUBWOOFER','MIDBASS','MIDRANGE','HORN','OTHER'];
 const patch=(key:string,i:number,p:any)=>setV((s:any)=>({...s,[key]:s[key].map((x:any,n:number)=>n===i?{...x,...p}:x)}));
 const remove=(key:string,i:number)=>setV((s:any)=>({...s,[key]:s[key].filter((_:any,n:number)=>n!==i)}));
 const add=(key:string,item:any)=>setV((s:any)=>({...s,[key]:[...s[key],item]}));
 const submit=async()=>{setSaving(true);setError('');try{const body=cleanConfig(v);if(isNew)await apiPost('/cars/'+carId+'/configurations',body);else await apiPut('/configurations/'+configuration.id,body);await onSaved()}catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения конфигурации')}finally{setSaving(false)}};
 return <Modal title={isNew?'Новая конфигурация':'Новая версия · '+configuration.name} onClose={onClose}>
  {error&&<div className="form-error"><AlertTriangle size={16}/>{error}</div>}
  <div className="form modal-form config-editor">
   <label>Название конфигурации<input value={v.name} onChange={e=>setV({...v,name:e.target.value})} required/></label><label>Виброизоляция<textarea rows={3} value={v.vibrationIsolation} onChange={e=>setV({...v,vibrationIsolation:e.target.value})}/></label><label>Описание<textarea rows={3} value={v.additionalDescription} onChange={e=>setV({...v,additionalDescription:e.target.value})}/></label>
   <ConfigListEditor title="Головные устройства" items={v.headUnits} onAdd={()=>add('headUnits',{brand:'',model:'',direction:'FRONT'})} onRemove={i=>remove('headUnits',i)}>{(x:any,i:number)=><div className="form-grid-3"><input placeholder="Бренд" value={x.brand} onChange={e=>patch('headUnits',i,{brand:e.target.value})}/><input placeholder="Модель" value={x.model} onChange={e=>patch('headUnits',i,{model:e.target.value})}/><select value={x.direction} onChange={e=>patch('headUnits',i,{direction:e.target.value})}>{directions.map(d=><option key={d}>{d}</option>)}</select></div>}</ConfigListEditor>
   <ConfigListEditor title="Аудиокомпоненты" items={v.audioComponents} onAdd={()=>add('audioComponents',{brand:'',model:'',quantity:1,type:'SUBWOOFER',direction:'FRONT'})} onRemove={i=>remove('audioComponents',i)}>{(x:any,i:number)=><div className="form-grid-5"><input placeholder="Бренд" value={x.brand} onChange={e=>patch('audioComponents',i,{brand:e.target.value})}/><input placeholder="Модель" value={x.model} onChange={e=>patch('audioComponents',i,{model:e.target.value})}/><input type="number" min="1" value={x.quantity} onChange={e=>patch('audioComponents',i,{quantity:Number(e.target.value)})}/><select value={x.type} onChange={e=>patch('audioComponents',i,{type:e.target.value})}>{types.map(t=><option key={t}>{t}</option>)}</select><select value={x.direction} onChange={e=>patch('audioComponents',i,{direction:e.target.value})}>{directions.map(d=><option key={d}>{d}</option>)}</select></div>}</ConfigListEditor>
   <ConfigListEditor title="Усилители" items={v.amplifiers} onAdd={()=>add('amplifiers',{brand:'',model:'',quantity:1,direction:'FRONT',componentLinks:[]})} onRemove={i=>remove('amplifiers',i)}>{(x:any,i:number)=><div><div className="form-grid-4"><input placeholder="Бренд" value={x.brand} onChange={e=>patch('amplifiers',i,{brand:e.target.value})}/><input placeholder="Модель" value={x.model} onChange={e=>patch('amplifiers',i,{model:e.target.value})}/><input type="number" min="1" value={x.quantity} onChange={e=>patch('amplifiers',i,{quantity:Number(e.target.value)})}/><select value={x.direction} onChange={e=>patch('amplifiers',i,{direction:e.target.value})}>{directions.map(d=><option key={d}>{d}</option>)}</select></div><div className="link-editor"><div className="muted">Подключённые компоненты</div>{(x.componentLinks??[]).map((l:any,li:number)=><div className="form-grid-3" key={li}><select value={l.componentId} onChange={e=>{const links=[...(x.componentLinks??[])];links[li]={...links[li],componentId:e.target.value};patch('amplifiers',i,{componentLinks:links})}}><option value="">Компонент</option>{v.audioComponents.map((ac:any,ai:number)=><option key={ai} value={String(ai)}>{ai+1}. {ac.brand} {ac.model} · {ac.type}</option>)}</select><input type="number" min="1" value={l.quantity??1} onChange={e=>{const links=[...(x.componentLinks??[])];links[li]={...links[li],quantity:Number(e.target.value)};patch('amplifiers',i,{componentLinks:links})}}/><button type="button" className="secondary-button compact" onClick={()=>{const links=(x.componentLinks??[]).filter((_:any,n:number)=>n!==li);patch('amplifiers',i,{componentLinks:links})}}>Убрать</button></div>)}<button type="button" className="text-button" onClick={()=>patch('amplifiers',i,{componentLinks:[...(x.componentLinks??[]),{componentId:'',quantity:1}]})}>+ компонент</button></div></div>}</ConfigListEditor>
   <ConfigListEditor title="Аккумуляторы" items={v.batteries} onAdd={()=>add('batteries',{brand:'',model:'',quantity:1})} onRemove={i=>remove('batteries',i)}>{(x:any,i:number)=><div className="form-grid-3"><input placeholder="Бренд" value={x.brand} onChange={e=>patch('batteries',i,{brand:e.target.value})}/><input placeholder="Модель" value={x.model} onChange={e=>patch('batteries',i,{model:e.target.value})}/><input type="number" min="1" value={x.quantity} onChange={e=>patch('batteries',i,{quantity:Number(e.target.value)})}/></div>}</ConfigListEditor>
   <ConfigListEditor title="Генераторы" items={v.generators} onAdd={()=>add('generators',{brand:'',model:'',quantity:1})} onRemove={i=>remove('generators',i)}>{(x:any,i:number)=><div className="form-grid-3"><input placeholder="Бренд" value={x.brand} onChange={e=>patch('generators',i,{brand:e.target.value})}/><input placeholder="Модель" value={x.model} onChange={e=>patch('generators',i,{model:e.target.value})}/><input type="number" min="1" value={x.quantity} onChange={e=>patch('generators',i,{quantity:Number(e.target.value)})}/></div>}</ConfigListEditor>
   <button className="primary-button" disabled={saving||!v.name.trim()} onClick={()=>void submit()}>{saving?<><Loader2 className="spin" size={15}/>Сохраняем…</>:'Сохранить'}</button>
  </div>
 </Modal>
}

function ConfigListEditor({title,items,onAdd,onRemove,children}:{title:string;items:any[];onAdd:()=>void;onRemove:(i:number)=>void;children:(x:any,i:number)=>React.ReactNode}){
 return <div className="config-section"><PanelTitle title={title} icon={Activity} action="Добавить" onAction={onAdd}/>{items.map((x,i)=><div className="config-row" key={x.id??i}>{children(x,i)}<button className="icon-button danger" type="button" onClick={()=>onRemove(i)}>×</button></div>)}{!items.length&&<span className="muted">Нет позиций</span>}</div>
}

function cleanConfig(v:any){
 const strip=(x:any):any=>{if(Array.isArray(x))return x.map(strip);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).filter(([k,val])=>!['id','versionId','configurationId','amplifierId','componentId','version'].includes(k)&&val!==undefined&&val!==null).map(([k,val])=>[k,k==='componentLinks'&&Array.isArray(val)?(val as any[]).filter((link:any)=>String(link.componentId).trim()!=='').map(strip):strip(val)]));return x};
 return strip(v);
}

function ConfigurationDetails({configuration,onClose,onEdit}:{configuration:any;onClose:()=>void;onEdit?:()=>void}){
 const version=configuration.versions?.[0];
 if(!version)return <Modal title="Конфигурация" onClose={onClose}><Empty text="Версия не найдена"/></Modal>;
 const names=(xs:any[])=>xs?.length?xs.map(x=>x.brand+' '+x.model+(x.quantity>1?' ×'+x.quantity:'')).join(', '):'—';
 return <Modal title={configuration.name+' · v'+version.version} onClose={onClose}><div className="config-details"><div className="detail-block"><span>Виброизоляция</span><strong>{version.vibrationIsolation||'—'}</strong></div><div className="detail-block"><span>Описание</span><strong>{version.additionalDescription||'—'}</strong></div><div className="detail-block"><span>Головные устройства</span><strong>{names(version.headUnits)}</strong></div><div className="detail-block"><span>Аудиокомпоненты</span><strong>{names(version.audioComponents)}</strong></div><div className="detail-block"><span>Усилители</span><strong>{names(version.amplifiers)}</strong></div><div className="detail-block"><span>Аккумуляторы</span><strong>{names(version.batteries)}</strong></div><div className="detail-block"><span>Генераторы</span><strong>{names(version.generators)}</strong></div></div>{onEdit&&<div className="modal-actions"><button className="primary-button" onClick={onEdit}>Создать новую версию</button></div>}</Modal>
}

function SeasonsPage(){return <ResourcePage title="Сезоны" subtitle="Сезонная структура чемпионата" path="/seasons" columns={[{key:'year',label:'Год'},{key:'name',label:'Название'},{key:'status',label:'Статус'},{key:'description',label:'Описание'}]} fields={[{name:'year',label:'Год',type:'number',required:true},{name:'name',label:'Название',required:true},{name:'status',label:'Статус',options:['DRAFT','ACTIVE','ARCHIVED']},{name:'description',label:'Описание',type:'textarea'}]} create={v=>apiPost('/seasons',{year:Number(v.year),name:String(v.name??'').trim(),description:v.description||undefined})} update={(id,v)=>apiPatch('/seasons/'+id,{name:v.name!==undefined?String(v.name).trim():undefined,description:v.description??undefined,status:v.status})}/>}
function StagesPage({go,user}:{go:(p:string)=>void;user:User}){const admin=user.role==='ADMIN';return <><ResourcePage title="Этапы" subtitle={admin?'Календарь соревнований и открытие регистрации':'Календарь этапов'} path="/stages" columns={[{key:'stageNumber',label:'#'},{key:'name',label:'Название'},{key:'city',label:'Город'},{key:'date',label:'Дата'},{key:'status',label:'Статус'},{key:'registrationOpen',label:'Регистрация'}]} fields={admin?[{name:'stageNumber',label:'Номер',type:'number',required:true},{name:'name',label:'Название',required:true},{name:'city',label:'Город'},{name:'date',label:'Дата',type:'datetime-local',required:true},{name:'status',label:'Статус',options:['DRAFT','PUBLISHED','COMPLETED','CANCELLED']},{name:'registrationOpen',label:'Открыть регистрацию',type:'checkbox'},{name:'registrationStartsAt',label:'Начало регистрации',type:'datetime-local'},{name:'registrationEndsAt',label:'Окончание регистрации',type:'datetime-local'},{name:'venue',label:'Площадка'},{name:'address',label:'Адрес'},{name:'description',label:'Описание',type:'textarea'},{name:'latitude',label:'Широта',type:'number'},{name:'longitude',label:'Долгота',type:'number'},{name:'seasonId',label:'Сезон',required:true,optionsPath:'/seasons',optionLabel:(x:any)=>(String(x.year??'')+(x.name?' · '+x.name:'')).trim()}]:undefined} create={admin?v=>apiPost('/stages',v):undefined} update={admin?(id,v)=>apiPatch('/stages/'+id,v):undefined} remove={admin?id=>apiDelete('/stages/'+id):undefined} searchPlaceholder="Название, город"/>{admin&&<StageClassesPanel/>}</>}
function StageClassesPanel(){
 const[stages,setStages]=useState<any[]>([]),[stageId,setStageId]=useState(''),[classes,setClasses]=useState<any[]>([]),[allClasses,setAllClasses]=useState<any[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[adding,setAdding]=useState(false),[saving,setSaving]=useState<string|null>(null);
 const loadStages=async()=>{try{const r=await apiGet<any>('/stages');const xs=listData(r);setStages(xs);if(!stageId&&xs[0]?.id)setStageId(xs[0].id)}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить этапы')}};
 const load=async(id:string)=>{if(!id)return;setLoading(true);setError('');try{const[a,b]=await Promise.all([apiGet<any>('/stages/'+id+'/classes?includeInactive=true'),apiGet<any>('/classes')]);setClasses(listData(a));setAllClasses(listData(b))}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить классы этапа')}finally{setLoading(false)}};
 useEffect(()=>{void loadStages()},[]);useEffect(()=>{if(stageId)void load(stageId)},[stageId]);
 const add=async(classId:string)=>{setAdding(true);setError('');try{await apiPost('/stages/'+stageId+'/classes',{classId});await load(stageId)}catch(e){setError(e instanceof Error?e.message:'Не удалось добавить класс')}finally{setAdding(false)}};
 const patch=async(classId:string,body:any)=>{setSaving(classId);setError('');try{await apiPatch('/stages/'+stageId+'/classes/'+classId,body);await load(stageId)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить настройки класса')}finally{setSaving(null)}};
 const remove=async(classId:string)=>{if(!confirm('Убрать класс с этапа?'))return;setSaving(classId);try{await apiDelete('/stages/'+stageId+'/classes/'+classId);await load(stageId)}catch(e){setError(e instanceof Error?e.message:'Не удалось убрать класс')}finally{setSaving(null)}};
 const available=allClasses.filter(x=>!classes.some(s=>s.classId===x.id&&s.isActive));
 const addAll=async()=>{
  if(!stageId||!allClasses.length)return;
  if(!confirm(`Добавить все активные классы на выбранный этап? Будут подключены все ${allClasses.length} классов.`))return;
  setAdding(true);setError('');
  try{await apiPut('/stages/'+stageId+'/classes',{classIds:allClasses.map(x=>x.id)});await load(stageId)}
  catch(e){setError(e instanceof Error?e.message:'Не удалось добавить все классы')}
  finally{setAdding(false)}
 };
 return <PageFrame title="Классы этапа" subtitle="Какие классы доступны участникам на выбранном этапе"><div className="toolbar stage-picker"><label>Этап<select value={stageId} onChange={e=>setStageId(e.target.value)}><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name}{s.city?' · '+s.city:''}</option>)}</select></label></div>{error&&<div className="notice"><AlertTriangle size={16}/>{error}</div>}{!stageId?<div className="panel"><Empty text="Выберите этап"/></div>:<div className="panel stage-class-panel">{loading?<LoadingPage small/>:<><div className="stage-class-add"><select value="" onChange={e=>{if(e.target.value)void add(e.target.value)}} disabled={adding}><option value="">{adding?'Добавляем…':'Добавить класс на этап'}</option>{available.map(x=><option key={x.id} value={x.id}>{x.name} · {x.direction?.name||'—'} · {x.unit}</option>)}</select><button type="button" className="primary-button compact" onClick={()=>void addAll()} disabled={adding||!allClasses.length}>{adding?'Добавляем…':'Добавить все классы'}</button></div>{!classes.length?<Empty text="На этом этапе пока нет классов"/>:<div className="stage-class-list">{classes.map((x:any)=><div className={'stage-class-card '+(x.isActive?'':'inactive')} key={x.id}><div className="stage-class-head"><div><strong>{x.customName||x.class?.name}</strong><span>{x.class?.direction?.name||'—'} · {x.class?.code||'—'} · {x.class?.unit||'DB'}</span></div><span className={'badge '+(x.isActive?'good':'bad')}>{x.isActive?'Активен':'Отключён'}</span></div><div className="stage-class-fields"><label>Порядок<input type="number" min="0" value={x.sortOrder??0} onChange={e=>setClasses(xs=>xs.map(y=>y.id===x.id?{...y,sortOrder:Number(e.target.value)}:y))}/></label><label>Лимит участников<input type="number" min="1" placeholder="Без лимита" value={x.participantLimit??''} onChange={e=>setClasses(xs=>xs.map(y=>y.id===x.id?{...y,participantLimit:e.target.value===''?null:Number(e.target.value)}:y))}/></label><label>Название на этапе<input value={x.customName??''} placeholder={x.class?.name||''} onChange={e=>setClasses(xs=>xs.map(y=>y.id===x.id?{...y,customName:e.target.value}:y))}/></label></div><div className="stage-class-actions"><button className="secondary-button compact" disabled={saving===x.classId} onClick={()=>void patch(x.classId,{sortOrder:x.sortOrder,participantLimit:x.participantLimit,customName:x.customName??null})}>{saving===x.classId?'Сохраняем…':'Сохранить'}</button>{x.isActive?<button className="danger-button" disabled={saving===x.classId} onClick={()=>void remove(x.classId)}>Убрать с этапа</button>:<button className="secondary-button compact" disabled={saving===x.classId} onClick={()=>void patch(x.classId,{isActive:true})}>Включить</button>}</div></div>)}</div>}</>}</div>}</PageFrame>
}
function ClassesPage(){const[tab,setTab]=useState<'classes'|'directions'>('classes');return <PageFrame title="Классы" subtitle="Направления, классы и единицы измерения" action={<div className="segmented"><button className={tab==='classes'?'selected':''} onClick={()=>setTab('classes')}>Классы</button><button className={tab==='directions'?'selected':''} onClick={()=>setTab('directions')}>Направления</button></div>}>{tab==='classes'?<ResourcePage title="Классы" subtitle="" path="/classes" columns={[{key:'code',label:'Код'},{key:'name',label:'Название'},{key:'direction.name',label:'Направление'},{key:'unit',label:'Единица'},{key:'isActive',label:'Активен'}]} fields={[{name:'directionId',label:'Направление',required:true,optionsPath:'/directions',optionLabel:(x:any)=>x.name??x.code??x.id},{name:'code',label:'Код',required:true},{name:'name',label:'Название',required:true},{name:'unit',label:'Единица',options:['DB','MPS','OTHER']},{name:'sortOrder',label:'Порядок',type:'number'},{name:'isActive',label:'Активен',type:'checkbox'}]} create={v=>apiPost('/classes',v)} update={(id,v)=>apiPatch('/classes/'+id,v)}/>:<ResourcePage title="Направления" subtitle="" path="/directions" columns={[{key:'name',label:'Название'},{key:'sortOrder',label:'Порядок'},{key:'isActive',label:'Активно'}]} fields={[{name:'name',label:'Название',required:true},{name:'sortOrder',label:'Порядок',type:'number'},{name:'isActive',label:'Активно',type:'checkbox'}]} create={v=>apiPost('/directions',v)} update={(id,v)=>apiPatch('/directions/'+id,v)} remove={id=>apiDelete('/directions/'+id)}/>}</PageFrame>}

function RegistrationsPage(){const[stageId,setStageId]=useState(''),[stages,setStages]=useState<any[]>([]),[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[status,setStatus]=useState<'ACTIVE'|'CANCELLED'|'ALL'>('ACTIVE');const load=async()=>{if(!stageId)return;setLoading(true);try{const q=status==='ALL'?'':'&status='+status;const r=await apiGet<any>('/registrations?stageId='+encodeURIComponent(stageId)+q);setRows(listData(r))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки')}finally{setLoading(false)}};useEffect(()=>{apiGet('/stages').then(r=>{const s=listData(r);setStages(s);if(s[0]?.id)setStageId(s[0].id)}).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки этапов'))},[]);useEffect(()=>{if(stageId)void load()},[stageId,status]);const cancel=async(id:string)=>{if(!confirm('Отменить регистрацию?'))return;try{await apiDelete('/registrations/'+id);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось отменить регистрацию')}};return <PageFrame title="Регистрации" subtitle="Регистрации по этапам, автомобилям и классам" action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}><div className="toolbar stage-picker"><label>Этап<select value={stageId} onChange={e=>setStageId(e.target.value)}><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}</select></label><select className="filter-select" value={status} onChange={e=>setStatus(e.target.value as any)}><option value="ACTIVE">Активные</option><option value="CANCELLED">Отменённые</option><option value="ALL">Все</option></select></div>{error&&<ErrorPanel message={error} retry={load}/>}<div className="panel table-wrap">{loading?<LoadingPage small/>:rows.length?<table className="data-table"><thead><tr><th>№</th><th>Участник</th><th>Автомобиль</th><th>Классы</th><th>Статус</th><th/></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.participantNumber}</strong></td><td>{[r.participant?.lastName,r.participant?.firstName,r.participant?.middleName].filter(Boolean).join(' ')||'—'}{r.participant?.team&&<small className="table-sub">{r.participant.team}</small>}</td><td>{[r.car?.brand,r.car?.model].filter(Boolean).join(' ')||'—'}<small className="table-sub">{r.car?.registrationNumber||'—'}</small></td><td>{r.classes?.map((x:any)=>x.class?.name).filter(Boolean).join(', ')||'—'}</td><td><span className={'badge '+(r.status==='ACTIVE'?'good':'')}>{r.status==='ACTIVE'?'Активна':'Отменена'}</span></td><td className="row-actions">{r.status==='ACTIVE'&&<button className="danger-button compact" onClick={()=>void cancel(r.id)}>Отменить</button>}</td></tr>)}</tbody></table>:<Empty text="Регистраций нет"/>}</div></PageFrame>}

function StagePicker({children}:{children:(stageId:string)=>React.ReactNode}){const[stages,setStages]=useState<any[]>([]),[stageId,setStageId]=useState('');useEffect(()=>{apiGet('/stages').then(r=>{const s=listData(r);setStages(s);if(s[0]?.id)setStageId(s[0].id)})},[]);return <><div className="toolbar stage-picker"><label>Этап<select value={stageId} onChange={e=>setStageId(e.target.value)}><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name}</option>)}</select></label></div>{stageId?children(stageId):<div className="panel"><Empty text="Выберите этап"/></div>}</>}
function InspectionsPage({user}:{user:User}){
 const[stageId,setStageId]=useState(''),[stages,setStages]=useState<any[]>([]),[loadingStages,setLoadingStages]=useState(true);
 useEffect(()=>{apiGet('/stages').then(r=>{const s=listData(r);setStages(s);if(s[0]?.id)setStageId(s[0].id)}).catch(()=>{}).finally(()=>setLoadingStages(false))},[]);
 return <PageFrame title="Инспекция въезда" subtitle="Проверка зарегистрированных участников перед допуском на этап">
  <div className="toolbar stage-picker">
   <label>Этап<select value={stageId} onChange={e=>setStageId(e.target.value)} disabled={loadingStages}><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}</select></label>
  </div>
  {stageId?<EntryInspection stageId={stageId} user={user}/>:<div className="panel"><Empty text="Выберите этап"/></div>}
 </PageFrame>
}
function EntryInspection({stageId,user}:{stageId:string;user:User}){
 const[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState('');
 const load=()=>{setLoading(true);setError('');return apiGet('/registrations?stageId='+encodeURIComponent(stageId)+'&status=ACTIVE').then(r=>setRows(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки регистраций')).finally(()=>setLoading(false))};
 useEffect(()=>{void load()},[stageId]);
 const filtered=rows.filter(r=>{const q=search.trim().toLowerCase();if(!q)return true;return [r.participantNumber,r.participant?.lastName,r.participant?.firstName,r.participant?.middleName,r.participant?.team,r.car?.brand,r.car?.model,r.car?.registrationNumber,r.classes?.map((x:any)=>x.class?.name).join(' ')].filter(Boolean).join(' ').toLowerCase().includes(q)});
 const passed=rows.filter(r=>r.inspection?.status==='PASSED').length,failed=rows.filter(r=>r.inspection?.status==='FAILED').length,pending=rows.filter(r=>!r.inspection).length;
 return <>
  <div className="inspection-summary">
   <div className="inspection-stat"><strong>{rows.length}</strong><span>зарегистрировано</span></div>
   <div className="inspection-stat good"><strong>{passed}</strong><span>прошли</span></div>
   <div className="inspection-stat bad"><strong>{failed}</strong><span>не прошли</span></div>
   <div className="inspection-stat pending"><strong>{pending}</strong><span>ожидают</span></div>
  </div>
  <div className="inspection-toolbar">
   <div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по №, участнику, автомобилю, госномеру или классу"/></div>
   <button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={15}/>Обновить</button>
   <span className="row-count">{filtered.length} из {rows.length}</span>
  </div>
  {error&&<div className="notice"><AlertTriangle size={18}/><span>{error}</span></div>}
  <div className="panel table-wrap">
   {loading?<LoadingPage small/>:filtered.length?<table className="data-table"><thead><tr><th>№</th><th>Участник</th><th>Автомобиль</th><th>Классы</th><th>Инспекция</th><th>Действие</th></tr></thead><tbody>{filtered.map(r=><InspectionRow key={r.id} registration={r} user={user} onSaved={load}/>)}</tbody></table>:<Empty text={rows.length?'Поиск ничего не нашёл':'На выбранный этап нет активных регистраций'}/>}
  </div>
 </>;
}
function InspectionRow({registration:r,user,onSaved}:{registration:any;user:User;onSaved:()=>Promise<any>}){
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[noteOpen,setNoteOpen]=useState(false),[notes,setNotes]=useState(r.inspection?.notes??'');
 const inspection=r.inspection, canEdit=!inspection||(user.role==='ADMIN'||inspection.checkedByUserId===user.id||inspection.createdByUserId===user.id);
 const save=async(status:'PASSED'|'FAILED')=>{if(status==='FAILED'&&!notes.trim()){setNoteOpen(true);setError('Для статуса «Не прошёл» укажите причину');return}setBusy(true);setError('');try{if(inspection){await apiPatch('/inspections/'+inspection.id,{status,notes:notes.trim()||null})}else{await apiPost('/inspections',{registrationId:r.id,status,notes:notes.trim()||undefined})}await onSaved();setNoteOpen(false)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить инспекцию')}finally{setBusy(false)}};
 const classes=(r.classes??[]).map((x:any)=>x.class?.name).filter(Boolean).join(', ');
 const status=inspection?.status;
 return <tr><td><strong>{r.participantNumber}</strong></td><td><strong>{[r.participant?.lastName,r.participant?.firstName].filter(Boolean).join(' ')}</strong>{r.participant?.team&&<small className="table-sub">{r.participant.team}</small>}</td><td><strong>{[r.car?.brand,r.car?.model].filter(Boolean).join(' ')}</strong>{r.car?.registrationNumber&&<small className="table-sub">{r.car.registrationNumber}</small>}</td><td>{classes||'—'}</td><td>{status==='PASSED'?<span className="badge good"><Check size={11}/>Прошёл</span>:status==='FAILED'?<span className="badge bad"><X size={11}/>Не прошёл</span>:<span className="badge">Ожидает</span>}{inspection?.notes&&<small className="table-sub">{inspection.notes}</small>}{error&&<small className="table-sub error-text">{error}</small>}</td><td>{canEdit?<div className="inspection-actions"><button className="secondary-button compact" disabled={busy} onClick={()=>void save('PASSED')}>{busy?'…':<><Check size={14}/>Прошёл</>}</button><button className="danger-button compact" disabled={busy} onClick={()=>{setNoteOpen(true);setError('')}}><X size={14}/>Не прошёл</button></div>:<span className="muted">Только автор проверки</span>}{noteOpen&&canEdit&&<div className="inspection-note"><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Причина непрохождения"/><button className="primary-button compact" disabled={busy} onClick={()=>void save('FAILED')}>{busy?'Сохраняем…':'Подтвердить'}</button></div>}</td></tr>
}
function ResultsPage({user}:{user:User}){return <PageFrame title="Результаты" subtitle="Официальные результаты. Судья вносит, ADMIN может корректировать."><StagePicker>{stageId=><ResultsStage stageId={stageId} user={user}/>}</StagePicker></PageFrame>}
function ResultsStage({stageId,user}:{stageId:string;user:User}){const[data,setData]=useState<any[]>([]),[registrations,setRegistrations]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[modal,setModal]=useState<any|null>(null),[saving,setSaving]=useState(false);const load=async()=>{setLoading(true);setError('');try{const[a,b]=await Promise.all([apiGet<any>('/results/admin/stage/'+stageId),apiGet<any>('/registrations?stageId='+encodeURIComponent(stageId)+'&status=ACTIVE')]);setData(listData(a));setRegistrations(listData(b))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки')}finally{setLoading(false)}};useEffect(()=>{void load()},[stageId]);const save=async(v:any)=>{setSaving(true);try{if(v.id&&user.role==='ADMIN')await apiPatch('/results/'+v.id,{value:Number(v.value),place:v.place===''?null:Number(v.place),notes:v.notes||null});else await apiPost('/results',{registrationId:v.registrationId,registrationClassId:v.registrationClassId,value:Number(v.value),place:v.place===''?undefined:Number(v.place),notes:v.notes||undefined,confirmed:true});setModal(null);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить результат')}finally{setSaving(false)}};return <>{error&&<ErrorPanel message={error} retry={load}/>}<div className="toolbar"><button className="primary-button compact" onClick={()=>setModal({})}><Plus size={14}/>Внести результат</button><button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button><span className="row-count">{data.length} результатов</span></div><div className="panel table-wrap">{loading?<LoadingPage small/>:data.length?<table className="data-table"><thead><tr><th>Класс</th><th>Участник</th><th>Авто</th><th>Результат</th><th>Место</th><th>Статус</th><th/></tr></thead><tbody>{data.map(r=><tr key={r.id}><td>{r.registrationClass?.class?.name||'—'}<small className="table-sub">{r.registrationClass?.class?.unit||''}</small></td><td>{[r.registration?.participant?.lastName,r.registration?.participant?.firstName].filter(Boolean).join(' ')||'—'}<small className="table-sub">№{r.registration?.participantNumber??'—'}</small></td><td>{[r.registration?.car?.brand,r.registration?.car?.model].filter(Boolean).join(' ')||'—'}</td><td><strong>{r.value}</strong></td><td>{r.place??'—'}</td><td>{r.isHistorical?<span className="badge">Исторический</span>:<span className="badge good">Официальный</span>}</td><td className="row-actions">{user.role==='ADMIN'&&!r.isHistorical&&<button className="icon-button" title="Исправить" onClick={()=>setModal({id:r.id,value:Number(r.value),place:r.place??'',notes:r.notes??''})}>✎</button>}</td></tr>)}</tbody></table>:<Empty text="Результатов пока нет"/>}</div>{modal!==null&&<ResultModal value={modal} registrations={registrations} saving={saving} onClose={()=>setModal(null)} onSubmit={save}/>}</>}
function ResultModal({value,registrations,saving,onClose,onSubmit}:{value:any;registrations:any[];saving:boolean;onClose:()=>void;onSubmit:(v:any)=>Promise<void>}){const[v,setV]=useState<any>(value??{});const selected=registrations.find(r=>r.id===v.registrationId);const classes=selected?.classes??[];return <Modal title={v.id?'Исправление результата':'Новый результат'} onClose={onClose}><form className="form modal-form" onSubmit={e=>{e.preventDefault();void onSubmit(v)}}>{!v.id&&<><label>Регистрация<select value={v.registrationId??''} onChange={e=>setV({...v,registrationId:e.target.value,registrationClassId:''})} required><option value="">Выберите участника</option>{registrations.map(r=><option key={r.id} value={r.id}>№{r.participantNumber} · {[r.participant?.lastName,r.participant?.firstName].filter(Boolean).join(' ')} · {[r.car?.brand,r.car?.model].filter(Boolean).join(' ')}</option>)}</select></label><label>Класс регистрации<select value={v.registrationClassId??''} onChange={e=>setV({...v,registrationClassId:e.target.value})} required><option value="">Выберите класс</option>{classes.map((x:any)=><option key={x.id} value={x.id}>{x.class?.name} · {x.class?.unit}</option>)}</select></label></>}<label>Результат<input type="number" step="0.001" min="0" value={v.value??''} onChange={e=>setV({...v,value:e.target.value})} required/></label><label>Место<input type="number" min="1" max="999" value={v.place??''} onChange={e=>setV({...v,place:e.target.value})}/></label><label>Комментарий<textarea rows={4} value={v.notes??''} onChange={e=>setV({...v,notes:e.target.value})}/></label><button className="primary-button" disabled={saving||(!v.id&&(!v.registrationId||!v.registrationClassId))}>{saving?'Сохраняем…':'Сохранить результат'}</button></form></Modal>}

function DisqualificationsPage(){
 const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=()=>{setLoading(true);setError('');return apiGet<any>('/disqualifications').then(r=>setData(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки дисквалификаций')).finally(()=>setLoading(false))};
 useEffect(()=>{void load()},[]);
 return <PageFrame title="Дисквалификации" subtitle="Контроль запретов на участие. Дисквалификация действует сразу и влияет на результаты." action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
  {error&&<ErrorPanel message={error} retry={load}/>}
  <div className="notice"><AlertTriangle size={17}/><span><strong>Важно:</strong> ADMIN выдаёт и отзывает дисквалификации. JUDGE только просматривает их.</span></div>
  <div className="panel table-wrap">{loading?<LoadingPage small/>:data.length?<table className="data-table"><thead><tr><th>Участник</th><th>Тип</th><th>Этап / сезон</th><th>Статус</th><th>Причина</th><th>Кем выдана</th><th>Дата</th></tr></thead><tbody>{data.map(d=><tr key={d.id}>
   <td><strong>{[d.participant?.lastName,d.participant?.firstName,d.participant?.middleName].filter(Boolean).join(' ')||'—'}</strong>{d.participant?.team&&<small className="table-sub">{d.participant.team}</small>}</td>
   <td><span className="badge">{d.scope==='STAGE'?'Этап':d.scope==='SEASON'?'Сезон':'Формат'}</span></td>
   <td>{d.scope==='STAGE'?<><strong>#{d.stage?.stageNumber??'—'} · {d.stage?.name??'Этап'}</strong>{d.stage?.city&&<small className="table-sub">{d.stage.city}</small>}</>:d.scope==='SEASON'?<><strong>{d.season?.name??'Сезон'}</strong>{d.season?.year&&<small className="table-sub">{d.season.year}</small>}</>:<strong>Весь формат</strong>}</td>
   <td><span className={`badge ${d.status==='ACTIVE'?'bad':'good'}`}>{d.status==='ACTIVE'?'Действует':'Отозвана'}</span></td>
   <td title={d.reason}>{d.reason||'—'}</td>
   <td>{d.issuedByUser?.name||'—'}{d.issuedByUser?.role&&<small className="table-sub">{d.issuedByUser.role}</small>}</td>
   <td>{formatDate(d.createdAt)}</td>
  </tr>)}</tbody></table>:<Empty text="Дисквалификаций нет"/>}</div>
 </PageFrame>
}
function HistoricalPage(){const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');const load=()=>{setLoading(true);setError('');return apiGet<any>('/historical-results').then(r=>setData(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки исторических результатов')).finally(()=>setLoading(false))};useEffect(()=>{void load()},[]);const verify=async(id:string)=>{try{await apiPost('/historical-results/'+id+'/verify',{});await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось подтвердить результат')}};return <PageFrame title="История результатов" subtitle="Архивные результаты: импортируются как PENDING и подтверждаются ADMIN" action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>{error&&<ErrorPanel message={error} retry={load}/>}<div className="panel table-wrap">{loading?<LoadingPage small/>:data.length?<table className="data-table"><thead><tr><th>Класс</th><th>Участник</th><th>Этап</th><th>Результат</th><th>Место</th><th>Проверка</th><th/></tr></thead><tbody>{data.map(r=><tr key={r.id}><td>{r.registrationClass?.class?.name||'—'}</td><td>{[r.registration?.participant?.lastName,r.registration?.participant?.firstName].filter(Boolean).join(' ')||'—'}<small className="table-sub">№{r.registration?.participantNumber??'—'}</small></td><td>{r.registration?.stage?<><strong>№{r.registration.stage.stageNumber} · {r.registration.stage.name}</strong><small className="table-sub">{r.registration.stage.season?.year??''}</small></>:'—'}</td><td><strong>{r.value}</strong> {r.unit}</td><td>{r.place??'—'}</td><td><span className={'badge '+(r.verificationStatus==='VERIFIED'?'good':'')}>{r.verificationStatus==='VERIFIED'?'Подтверждён':'Ожидает проверки'}</span></td><td className="row-actions">{r.verificationStatus==='PENDING'&&<button className="primary-button compact" onClick={()=>void verify(r.id)}>Подтвердить</button>}</td></tr>)}</tbody></table>:<Empty text="Исторических результатов нет"/>}</div></PageFrame>}

function OperationalPage({title,subtitle,icon:Icon,endpoint}:{title:string;subtitle:string;icon:any;endpoint:string}){const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');const load=()=>{setLoading(true);return apiGet<any>(endpoint).then(r=>setData(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Для списка требуется выбранный этап')).finally(()=>setLoading(false))};useEffect(()=>{void load()},[endpoint]);return <PageFrame title={title} subtitle={subtitle} action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>{error&&<div className="notice"><Icon size={18}/><span>{error}</span></div>}<div className="panel table-wrap">{loading?<LoadingPage small/>:<DataTable rows={data} columns={autoColumns(data)}/>}</div></PageFrame>}

function sheetRows(values:any){
  if(!Array.isArray(values))return [];
  const rows=values.filter((row:any)=>Array.isArray(row)&&row.some((x:any)=>String(x??'').trim()!==''));
  if(rows.length<2)return [];
  const headers=(rows[0]??[]).map((x:any)=>String(x??'').replace(/^\\uFEFF/,'').trim());
  return rows.slice(1).map((row:any[])=>{
    const item:any={};
    headers.forEach((h:string,i:number)=>{if(h)item[h]=row?.[i]??''});
    return item;
  }).filter((item:any)=>Object.values(item).some((x:any)=>String(x??'').trim()!==''));
}

function resultSheetRows(values:any){
  const rows=sheetRows(values);
  let currentClass='';
  return rows.map((row:any)=>{
    const classValue=String(row['Класс']??'').trim();
    if(classValue)currentClass=classValue;
    return currentClass?{...row,'Класс':currentClass}:row;
  }).filter((row:any)=>String(row['Номер']??row['Номер участника']??'').trim()!=='');
}
function ImportPage(){
 const[stages,setStages]=useState<any[]>([]),[stageId,setStageId]=useState(''),[mode,setMode]=useState<'NORMAL'|'HISTORICAL'>('NORMAL');
 const[google,setGoogle]=useState<any>(null),[spreadsheets,setSpreadsheets]=useState<any[]>([]),[spreadsheetId,setSpreadsheetId]=useState(''),[spreadsheet,setSpreadsheet]=useState<any>(null);
 const[result,setResult]=useState<any>(null),[job,setJob]=useState<any>(null),[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[resolveRow,setResolveRow]=useState<any|null>(null),[resolution,setResolution]=useState('{}');
 const loadGoogle=async()=>{try{const s=await getGoogleStatus();setGoogle(s);if(s.connected){const r=await getGoogleSpreadsheets();setSpreadsheets(r.spreadsheets??[])}}catch(e){setError(e instanceof Error?e.message:'Не удалось проверить Google')}};
 useEffect(()=>{apiGet('/stages').then(r=>{const s=listData(r);setStages(s);if(s[0]?.id)setStageId(s[0].id)}).catch(e=>setError(e instanceof Error?e.message:'Не удалось загрузить этапы'));void loadGoogle();},[]);
 useEffect(()=>{if(!spreadsheetId){setSpreadsheet(null);return}getGoogleSpreadsheet(spreadsheetId).then(r=>setSpreadsheet(r.spreadsheet)).catch(e=>setError(e instanceof Error?e.message:'Не удалось открыть таблицу'))},[spreadsheetId]);
 const preview=async()=>{
   setLoading(true);setError('');
   try{
     if(!stageId||!spreadsheetId)throw new Error('Выберите этап и Google Таблицу');
     const sheetNames=(spreadsheet?.sheets??[]).map((s:any)=>s.title);
     if(!sheetNames.includes('Результаты'))throw new Error('В таблице отсутствует лист «Результаты»');
     if(mode==='HISTORICAL'&&!sheetNames.includes('Регистрация'))throw new Error('Для исторического импорта нужен лист «Регистрация»');
     const resultResponse=await getGoogleSheetValues(spreadsheetId,'Результаты');
     const resultValues=Array.isArray(resultResponse?.values)
       ? resultResponse.values
       : (Array.isArray(resultResponse?.values?.values) ? resultResponse.values.values : []);
     const results=resultSheetRows(resultValues);
     if(!results.length)throw new Error('Лист «Результаты» пустой или не содержит строк данных');
     let registrations:any[]=[];
     if(mode==='HISTORICAL'){
       const regResponse=await getGoogleSheetValues(spreadsheetId,'Регистрация');
       const regValues=Array.isArray(regResponse?.values)
         ? regResponse.values
         : (Array.isArray(regResponse?.values?.values) ? regResponse.values.values : []);
       registrations=sheetRows(regValues);
       if(!registrations.length)throw new Error('Лист «Регистрация» пустой или не содержит строк данных');
     }
     const r=await apiPost<any>('/imports/stage/preview',{stageId,registrations,results,historicalResults:mode==='HISTORICAL'});
     setResult(r);setJob(r.importJob);
     if(r.importJob?.id){const full=await apiGet<any>('/imports/'+r.importJob.id);setJob(full.importJob);setRows(full.importJob?.rows??[])}else setRows([]);
   }catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить Preview')}finally{setLoading(false)}
 };
 const refreshJob=async(id:string)=>{try{const r=await apiGet<any>('/imports/'+id);setJob(r.importJob);setRows(r.importJob?.rows??[])}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить импорт')}};
 const resolve=async()=>{if(!resolveRow||!job?.id)return;setLoading(true);setError('');try{await apiPatch('/imports/'+job.id+'/rows/'+resolveRow.id+'/resolve',{resolution:JSON.parse(resolution||'{}')});setResolveRow(null);await refreshJob(job.id)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить решение строки')}finally{setLoading(false)}};
 const commit=async()=>{if(!job?.id)return;setLoading(true);setError('');try{await apiPost('/imports/'+job.id+'/commit',{});await refreshJob(job.id)}catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить commit')}finally{setLoading(false)}};
 const visibleRows=mode==='HISTORICAL'?rows.filter((r:any)=>r.type==='RESULT'):rows;
 const readyCount=visibleRows.filter((r:any)=>r.status==='READY').length;
 const warnCount=visibleRows.filter((r:any)=>r.status==='WARNING').length;
 const resolvedCount=visibleRows.filter((r:any)=>r.status==='RESOLVED').length;
 const resultWarnCount=visibleRows.filter((r:any)=>r.type==='RESULT'&&r.status==='WARNING').length;
 const blockingWarnCount=mode==='HISTORICAL'?resultWarnCount:warnCount;
 const resultSheet=spreadsheet?.sheets?.find((s:any)=>s.title==='Результаты'),registrationSheet=spreadsheet?.sheets?.find((s:any)=>s.title==='Регистрация');
 return <PageFrame title="Импорт" subtitle="Импорт из Google Таблиц: сначала Preview, затем исправление предупреждений и только после этого запись в чемпионат." action={job?.id?<button className="secondary-button compact" onClick={()=>void refreshJob(job.id)}><RefreshCw size={14}/>Обновить импорт</button>:undefined}>
  <div className="import-steps"><div className="import-step active"><b>1</b><span>Источник и этап</span></div><div className="import-step"><b>2</b><span>Проверка</span></div><div className="import-step"><b>3</b><span>Исправление</span></div><div className="import-step"><b>4</b><span>Commit</span></div></div>
  <div className="notice"><FileInput size={17}/><div><strong>Google Таблицы:</strong> аккаунт подключается один раз. Для обычного импорта используется только <b>Результаты</b>. Для исторического — <b>Регистрация</b> + <b>Результаты</b>.</div></div>
  <div className="import-grid">
   <div className="panel form">
    <div className="segmented"><button className={mode==='NORMAL'?'selected':''} onClick={()=>setMode('NORMAL')}>Обычный импорт</button><button className={mode==='HISTORICAL'?'selected':''} onClick={()=>setMode('HISTORICAL')}>Исторический</button></div>
    {!google?.connected?<div className="notice"><AlertTriangle size={16}/><span>Google аккаунт ещё не подключён.</span><button className="primary-button compact" onClick={()=>void connectGoogle()}>Подключить Google</button></div>:<div className="notice"><Check size={16}/><span>Подключён: <strong>{google.email}</strong></span></div>}
    <label>Этап<select value={stageId} onChange={e=>setStageId(e.target.value)}><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}</select></label>
    <label>Google Таблица<select value={spreadsheetId} onChange={e=>setSpreadsheetId(e.target.value)} disabled={!google?.connected}><option value="">Выберите таблицу</option>{spreadsheets.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    {spreadsheet&&<div className="import-example"><b>{spreadsheet.title}</b><br/>Регистрация: {registrationSheet?'найден':'не найден'}<br/>Результаты: {resultSheet?'найден':'не найден'}</div>}
    <button className="primary-button" disabled={loading||!stageId||!spreadsheetId||!google?.connected} onClick={()=>void preview()}>{loading?'Загружаем и проверяем…':'1. Загрузить и запустить Preview'}</button>
    {error&&<div className="form-error"><AlertTriangle size={16}/>{error}</div>}
   </div>
   <div className="panel"><PanelTitle title="Результат проверки" icon={FileInput}/>
    {job?<><div className="import-summary"><div><b>{readyCount}</b><span>готово</span></div><div className="warning"><b>{warnCount}</b><span>нужно исправить</span></div><div className="resolved"><b>{resolvedCount}</b><span>исправлено</span></div><div><b>{mode==='HISTORICAL'?resultWarnCount:visibleRows.length}</b><span>{mode==='HISTORICAL'?'ошибок в результатах':'строк в работе'}</span></div></div>
      <div className="import-job-line">Импорт: <strong>{job.id}</strong> · статус: <strong>{job.status}</strong></div>
      <div className="import-rows">{visibleRows.slice(0,100).map((r:any,i:number)=><div className="import-row" key={r.id??i}><span className={`import-row-status ${String(r.status).toLowerCase()}`}>{r.status}</span><span className="import-row-main"><b>{r.type==='REGISTRATION'?'Регистрация':'Результат'} · строка {r.rowNumber}</b><small>{Array.isArray(r.warnings)?r.warnings.join(' · '):typeof r.warnings==='object'?JSON.stringify(r.warnings):r.warnings||'Ошибок нет'}</small></span>{r.status==='WARNING'&&(mode!=='HISTORICAL'||r.type==='RESULT')&&<button className="secondary-button compact" onClick={()=>{setResolveRow(r);setResolution(r.resolution?JSON.stringify(r.resolution,null,2):JSON.stringify({},null,2))}}>Исправить</button>}</div>)}</div>
      {blockingWarnCount===0&&job.status==='DRAFT'&&<button className="primary-button" disabled={loading} onClick={()=>void commit()}>4. Подтвердить и записать импорт</button>}
      {blockingWarnCount>0&&<div className="notice"><AlertTriangle size={16}/><span>{mode==='HISTORICAL'?'Исправьте предупреждения в строках результатов. Лист «Регистрация» используется только как справочник и сам по себе ничего не создаёт.':'Есть предупреждения. Пока остаётся хотя бы один WARNING — Commit заблокирован.'}</span></div>}
      {job.status==='COMMITTED'&&<div className="notice"><Check size={17}/><span>Импорт успешно записан в базу USD 2.0.</span></div>}
    </>:<Empty text="После Preview здесь появится отчёт по каждой строке"/>}
   </div>
  </div>
  {resolveRow&&<ImportResolutionModal row={resolveRow} stageId={stageId} mode={mode} resolution={resolution} setResolution={setResolution} loading={loading} onClose={()=>setResolveRow(null)} onSave={async()=>{await resolve()}}/>}
 </PageFrame>
}

function ImportResolutionModal({row,stageId,mode,resolution,setResolution,loading,onClose,onSave}:{row:any;stageId:string;mode:'NORMAL'|'HISTORICAL';resolution:string;setResolution:(v:string)=>void;loading:boolean;onClose:()=>void;onSave:()=>Promise<void>}){
 const[data,setData]=useState<any[]>([]),[cars,setCars]=useState<any[]>([]),[registrations,setRegistrations]=useState<any[]>([]),[classes,setClasses]=useState<any[]>([]),[loadingOptions,setLoadingOptions]=useState(true),[localError,setLocalError]=useState('');
 const parsed=useMemo(()=>{try{return JSON.parse(resolution||'{}')}catch{return {}}},[resolution]);
 const raw=row.rawData??{}, normalized=row.normalizedData??{};
 const resultParticipant=normalized.participant?.matches?.[0]??null;
 const participantName=normalized.participant?.rawName??raw['ФИО']??raw['Фамилия и имя']??'';
 const participantNumber=normalized.participantNumber??normalized.resultParticipantNumber??raw['Номер']??raw['Номер участника']??'';
 const setPart=(patch:any)=>setResolution(JSON.stringify({...parsed,participant:{...(parsed.participant??{}),...patch}},null,2));
 const setReg=(patch:any)=>setResolution(JSON.stringify({...parsed,registration:{...(parsed.registration??{}),...patch}},null,2));
 const setCar=(patch:any)=>setResolution(JSON.stringify({...parsed,car:{...(parsed.car??{}),...patch}},null,2));
 const setClass=(classId:string)=>setResolution(JSON.stringify({...parsed,classId},null,2));
 const setResultField=(patch:any)=>setResolution(JSON.stringify({...parsed,...patch},null,2));

 useEffect(()=>{let cancelled=false;setLoadingOptions(true);Promise.all([
   apiGet<any>('/participants'),
   apiGet<any>('/cars'),
   apiGet<any>('/registrations?stageId='+encodeURIComponent(stageId)),
   apiGet<any>('/classes')
 ]).then(([p,c,r,cl])=>{if(cancelled)return;setData(listData(p));setCars(listData(c));setRegistrations(listData(r));setClasses(listData(cl))}).catch(e=>setLocalError(e instanceof Error?e.message:'Не удалось загрузить варианты для решения')).finally(()=>{if(!cancelled)setLoadingOptions(false)});return()=>{cancelled=true}},[stageId]);

 const participantCandidates=useMemo(()=>{
   const q=String(participantName).trim().toLowerCase();
   const n=Number(participantNumber);
   return data.filter(p=>{
     const name=[p.lastName,p.firstName,p.middleName].filter(Boolean).join(' ').toLowerCase();
     return (q&&name.includes(q))||(Number.isFinite(n)&&n>0&&p.participantNumber===n);
   }).slice(0,8);
 },[data,participantName,participantNumber]);

 const selectedParticipantId=parsed.participant?.participantId;
 const selectedParticipant=data.find(p=>p.id===selectedParticipantId);
 const selectedRegistrationId=parsed.registration?.registrationId;
 const selectedRegistration=registrations.find(r=>r.id===selectedRegistrationId);
 const registrationAction=parsed.registration?.action;
 const resolvedParticipantNumber=Number(parsed.registration?.participantNumber??participantNumber);
 const displayParticipantNumber=Number.isInteger(resolvedParticipantNumber)&&resolvedParticipantNumber>0?String(resolvedParticipantNumber).padStart(3,'0'):'—';
 const carCandidates=cars.filter(c=>!selectedParticipantId||c.participantId===selectedParticipantId).slice(0,8);
 const registrationCandidates=registrations.filter(r=>{
   const n=Number(participantNumber);
   return (Number.isFinite(n)&&n>0&&r.participantNumber===n)||(
     selectedParticipantId&&r.participantId===selectedParticipantId
   );
 }).slice(0,8);

 const createParticipant=()=>setPart({action:'CREATE',fullName:String(participantName).trim(),team:String(raw['Команда']??'').trim()||null,email:String(raw['Email']??'').trim()||null});
 const useParticipant=(p:any)=>setPart({action:'USE_EXISTING',participantId:p.id});
 const createRegistration=()=>setReg({action:'CREATE',participantNumber:Number(participantNumber)});
 const useRegistration=(r:any)=>setReg({action:'USE_EXISTING',registrationId:r.id,participantNumber:r.participantNumber});
 const createCar=()=>setCar({action:'CREATE',brand:String(raw['Марка автомобиля']??raw['Марка']??'').trim()||undefined,model:String(raw['Модель автомобиля']??raw['Модель']??'').trim()||undefined,registrationNumber:String(raw['Номер автомобиля']??raw['Гос. номер']??'').trim()||undefined,registrationCountry:'RU'});
 const useCar=(c:any)=>setCar({action:'USE_EXISTING',carId:c.id});
 const autoClass=normalized.class?.classId;
 const currentClassId=parsed.classId??autoClass??'';
 const classCandidates=classes.filter(c=>!normalized.class?.className||String(c.name).trim().toLowerCase()===String(normalized.class?.className).trim().toLowerCase()||String(c.code??'').trim().toLowerCase()===String(normalized.class?.className).trim().toLowerCase()).slice(0,12);

 return <Modal title={`Исправление строки №\${row.rowNumber}`} onClose={onClose}>
  <div className="import-resolution">
   <div className="notice"><AlertTriangle size={16}/><span>Теперь не нужно писать JSON вручную. Нажимай действия ниже — система сама собирает корректное решение.</span></div>
   {localError&&<div className="form-error"><AlertTriangle size={16}/>{localError}</div>}
   <div className="resolution-source">
    <div><strong>Исходная строка</strong><pre className="json-view">{JSON.stringify(raw,null,2)}</pre></div>
    <div><strong>Что система определила</strong><pre className="json-view">{JSON.stringify(normalized,null,2)}</pre></div>
   </div>

   <div className="resolution-actions">
    <div className="resolution-action-card">
     <div className="resolution-action-head"><UserRound size={17}/><strong>Участник</strong></div>
     <div className="resolution-action-value">{participantName||'Не определён'}{participantNumber&&<small>№ {participantNumber}</small>}</div>
     <div className="resolution-buttons">
      {selectedParticipantId&&<span className="badge good"><Check size={11}/>Участник выбран</span>}
      {participantCandidates.map(p=><button key={p.id} className="secondary-button compact" onClick={()=>useParticipant(p)}>Использовать: {[p.lastName,p.firstName].filter(Boolean).join(' ')}</button>)}
      {mode==='HISTORICAL'&&<button className="primary-button compact" onClick={createParticipant}><Plus size={14}/>Создать участника</button>}
     </div>
    </div>

    <div className="resolution-action-card">
     <div className="resolution-action-head"><ClipboardCheck size={17}/><strong>Регистрация на этап</strong></div>
     <div className="resolution-action-value">{selectedRegistration?[selectedRegistration.participantNumber,selectedRegistration.participant?.lastName,selectedRegistration.participant?.firstName].filter(Boolean).join(' · '):registrationAction==='CREATE'?'Создание регистрации №'+displayParticipantNumber:'Не выбрана'}</div>
     <div className="resolution-buttons">
      {registrationCandidates.map(r=><button key={r.id} className="secondary-button compact" onClick={()=>useRegistration(r)}>Использовать №{String(r.participantNumber).padStart(3,'0')}</button>)}
      {mode==='HISTORICAL'&&<button className="primary-button compact" disabled={!Number.isInteger(resolvedParticipantNumber)||resolvedParticipantNumber<=0} onClick={createRegistration}><Plus size={14}/>{registrationAction==='CREATE'?'Регистрация №'+displayParticipantNumber+' выбрана':'Создать регистрацию №'+displayParticipantNumber}</button>}
     </div>
     {mode==='NORMAL'&&<small className="muted">В обычном импорте регистрацию только выбираем — создавать её нельзя.</small>}
    </div>

    <div className="resolution-action-card">
     <div className="resolution-action-head"><CarFront size={17}/><strong>Автомобиль</strong></div>
     <div className="resolution-action-value">{String(raw['Модель автомобиля']??raw['Модель']??'Автомобиль из импорта')}{raw['Номер автомобиля']&&<small>{String(raw['Номер автомобиля'])}</small>}</div>
     <div className="resolution-buttons">
      {carCandidates.map(c=><button key={c.id} className="secondary-button compact" onClick={()=>useCar(c)}>Использовать: {c.brand} {c.model}</button>)}
      {mode==='HISTORICAL'&&<button className="primary-button compact" onClick={createCar}><Plus size={14}/>Создать машину</button>}
     </div>
     {mode==='NORMAL'&&<small className="muted">В обычном импорте автомобиль не создаём — он уже должен быть у регистрации.</small>}
    </div>

    <div className="resolution-action-card">
     <div className="resolution-action-head"><Trophy size={17}/><strong>Класс</strong></div>
     <div className="resolution-action-value">{normalized.class?.className??raw['Класс']??'Не определён'}</div>
     <div className="resolution-buttons">
      {classCandidates.map(c=><button key={c.id} className={currentClassId===c.id?'primary-button compact':'secondary-button compact'} onClick={()=>setClass(c.id)}>{currentClassId===c.id?<Check size={14}/>:null}{c.name}</button>)}
      {!classCandidates.length&&<select value={currentClassId} onChange={e=>setClass(e.target.value)}><option value="">Выберите класс</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
     </div>
    </div>

    <div className="resolution-action-card">
     <div className="resolution-action-head"><Check size={17}/><strong>Результат</strong></div>
     <div className="resolution-buttons resolution-fields">
      <label>Результат<input type="number" step="0.01" value={parsed.value??normalized.result??''} onChange={e=>setResultField({value:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Место<input type="number" min="1" step="1" value={parsed.place??normalized.place??''} onChange={e=>setResultField({place:e.target.value===''?null:Number(e.target.value)})}/></label>
      <label>Комментарий<input value={parsed.notes??''} onChange={e=>setResultField({notes:e.target.value||null})}/></label>
     </div>
    </div>
   </div>

   <details className="resolution-json-preview"><summary>Показать итоговое решение JSON</summary><pre className="json-view">{JSON.stringify(parsed,null,2)}</pre></details>
   <div className="resolution-footer"><button className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" disabled={loading||loadingOptions} onClick={()=>void onSave()}>{loading?<><Loader2 className="spin" size={15}/>Сохраняем…</>:<><Check size={15}/>Сохранить решение</>}</button></div>
  </div>
 </Modal>
}

function RecordsPage(){
 const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=()=>{setLoading(true);setError('');return apiGet<any>('/records/admin/current').then(r=>setData(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки рекордов')).finally(()=>setLoading(false))};
 useEffect(()=>{void load()},[]);
 return <PageFrame title="Рекорды" subtitle="Текущие действующие рекорды чемпионата" action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
  {error&&<ErrorPanel message={error} retry={load}/>}
  <div className="panel table-wrap">{loading?<LoadingPage small/>:data.length?<table className="data-table"><thead><tr><th>Класс</th><th>Участник</th><th>Автомобиль</th><th>Результат</th><th>Ед.</th><th>Этап</th><th>Дата</th></tr></thead><tbody>{data.map((r:any)=>{const p=r.result?.registration?.participant;const car=r.result?.registration?.car;const st=r.stage;const cls=r.class;return <tr key={r.id}>
   <td><strong>{cls?.name??'—'}</strong>{cls?.direction?.name&&<small className="table-sub">{cls.direction.name}</small>}</td>
   <td><strong>{[p?.lastName,p?.firstName,p?.middleName].filter(Boolean).join(' ')||'—'}</strong>{p?.team&&<small className="table-sub">{p.team}</small>}</td>
   <td>{[car?.brand,car?.model].filter(Boolean).join(' ')||'—'}</td>
   <td><strong>{r.value??r.result?.value??'—'}</strong></td>
   <td>{r.unit??r.result?.unit??'—'}</td>
   <td>{st?<><strong>№{st.stageNumber} · {st.name}</strong>{st.city&&<small className="table-sub">{st.city}</small>}</>:'—'}</td>
   <td>{formatDate(r.achievedAt)}</td>
  </tr>})}</tbody></table>:<Empty text="Рекордов пока нет"/>}</div>
 </PageFrame>
}
function StatisticsPage(){
 const[overview,setOverview]=useState<any>(null),[participants,setParticipants]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=()=>{setLoading(true);setError('');return Promise.all([apiGet<any>('/statistics/overview'),apiGet<any>('/statistics/participants?limit=50')]).then(([o,p])=>{setOverview(o?.stats??o);setParticipants(listData(p))}).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки статистики')).finally(()=>setLoading(false))};
 useEffect(()=>{void load()},[]);
 const s=overview??{};
 return <PageFrame title="Статистика" subtitle="Понятные показатели чемпионата: участники, автомобили, этапы, выступления и рекорды" action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
  {error&&<ErrorPanel message={error} retry={load}/>}
  <div className="kpi-grid small">
   {[['participants','Участники','Зарегистрированные профили'],['cars','Автомобили','Активные автомобили'],['seasons','Сезоны','Активные сезоны'],['stages','Этапы','Этапы чемпионата'],['activeRegistrations','Активные регистрации','Регистрации со статусом ACTIVE'],['appearances','Выступления','Учтённые результаты'],['currentRecords','Текущие рекорды','Действующие рекорды']].map(([key,label,hint])=><div className="stat-card" key={key}><span>{label}</span><strong>{loading?'—':String(s[key]??0)}</strong><small>{hint}</small></div>)}
  </div>
  <div className="panel">
   <PanelTitle title="Участники и спортивная статистика" icon={Users}/>
   {loading?<LoadingPage small/>:<table className="data-table"><thead><tr><th>Участник</th><th>Команда</th><th>Этапы</th><th>Регистрации</th><th>Результаты</th><th>Победы</th><th>Подиумы</th><th>Автомобили</th><th>Рекорды</th></tr></thead><tbody>{participants.map((p:any)=>{const st=p.stats??{};return <tr key={p.participant?.id??p.id}><td><strong>{[p.participant?.lastName,p.participant?.firstName,p.participant?.middleName].filter(Boolean).join(' ')||'—'}</strong></td><td>{p.participant?.team||'—'}</td><td>{st.attendedStages??0}</td><td>{st.registrations??0}</td><td>{st.resultCount??0}</td><td><span className="badge good">{st.firstPlaces??0}</span></td><td>{st.podiums??0}</td><td>{st.cars??0}</td><td>{st.records??0}</td></tr>})}</tbody></table>}
  </div>
 </PageFrame>
}
function UsersPage(){
 const[data,setData]=useState<any[]>([]),[search,setSearch]=useState(''),[role,setRoleFilter]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[modal,setModal]=useState<any|null>(null),[saving,setSaving]=useState(false);
 const load=()=>{setLoading(true);const q=new URLSearchParams();if(search.trim())q.set('search',search.trim());if(role)q.set('role',role);return apiGet<any>('/auth/admin/users'+(q.toString()?'?'+q:'')).then(r=>setData(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки')).finally(()=>setLoading(false))};
 useEffect(()=>{void load()},[role]);
 const save=async(v:any)=>{setSaving(true);try{await apiPost('/auth/admin/users',v);setModal(null);await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка создания')}finally{setSaving(false)}};
 const setActive=async(u:any)=>{try{await apiPatch('/auth/admin/users/'+u.id+'/active',{active:!u.isActive});await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка изменения статуса')}};
 const changeRole=async(u:any,r:string)=>{try{await apiPatch('/auth/admin/users/'+u.id+'/role',{role:r});await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка изменения роли')}};
 return <PageFrame title="Пользователи" subtitle="Учётные записи, роли и доступ к системе" action={<button className="primary-button compact" onClick={()=>setModal({role:'PARTICIPANT'})}><Plus size={15}/>Создать</button>}>
  <div className="toolbar"><div className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void load()}} placeholder="Email"/></div><select className="filter-select" value={role} onChange={e=>setRoleFilter(e.target.value)}><option value="">Все роли</option><option value="ADMIN">ADMIN</option><option value="JUDGE">JUDGE</option><option value="PARTICIPANT">PARTICIPANT</option></select><button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/></button><span className="row-count">{data.length} пользователей</span></div>
  {error&&<ErrorPanel message={error} retry={load}/>}<div className="panel table-wrap">{loading?<LoadingPage small/>:<table className="data-table"><thead><tr><th>Email</th><th>Роль</th><th>Статус</th><th>Подтверждение</th><th>Создан</th><th/></tr></thead><tbody>{data.map(u=><tr key={u.id}><td>{u.email}</td><td><select className="inline-select" value={u.role} onChange={e=>void changeRole(u,e.target.value)}><option>ADMIN</option><option>JUDGE</option><option>PARTICIPANT</option></select></td><td><span className={`badge ${u.isActive?'good':''}`}>{u.isActive?'Активен':'Отключён'}</span></td><td>{u.emailVerifiedAt?'Да':'Нет'}</td><td>{formatDate(u.createdAt)}</td><td className="row-actions"><button className="secondary-button compact" onClick={()=>void setActive(u)}>{u.isActive?'Отключить':'Включить'}</button></td></tr>)}</tbody></table>}</div>
  {modal!==null&&<Modal title="Новый пользователь" onClose={()=>setModal(null)}><EntityForm fields={[{name:'email',label:'Email',type:'email',required:true},{name:'password',label:'Пароль',type:'password',required:true},{name:'role',label:'Роль',options:['ADMIN','JUDGE','PARTICIPANT'],required:true}]} initial={modal} saving={saving} onSubmit={save}/></Modal>}
 </PageFrame>
}
function AuditPage(){const[data,setData]=useState<any[]>([]);useEffect(()=>{getAudit(1,100).then(r=>setData(listData(r)))},[]);return <PageFrame title="Аудит" subtitle="Журнал административных действий"><div className="panel table-wrap"><DataTable rows={data} columns={autoColumns(data)}/></div></PageFrame>}
function QualityPage(){const[data,setData]=useState<any>(null);useEffect(()=>{getDataQuality().then(setData)},[]);return <PageFrame title="Контроль данных" subtitle="Центр качества данных"><div className="quality-summary">{data&&<><div className="stat-card"><span>Всего проблем</span><strong>{data.counts.total}</strong></div><div className="stat-card danger-card"><span>Ошибки</span><strong>{data.counts.error}</strong></div><div className="stat-card"><span>Предупреждения</span><strong>{data.counts.warning}</strong></div><div className="stat-card"><span>Информация</span><strong>{data.counts.info}</strong></div></>}</div><div className="panel table-wrap"><DataTable rows={data?.issues??[]} columns={autoColumns(data?.issues??[])}/></div></PageFrame>}

function ResourcePlaceholder({title,icon:Icon}:{title:string;icon:any}){return <Coming title={title} icon={Icon} user={{role:'ADMIN'} as User}/>}

function SiteSettingsPage(){
 const[settings,setSettings]=useState<any|null>(null),[tab,setTab]=useState('branding'),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[preview,setPreview]=useState<Record<string,string>>({});
 const load=async()=>{setLoading(true);setError('');try{const r=await getSiteSettings();setSettings(r.settings)}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить настройки')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 if(loading)return <PageFrame title="Настройки сайта" subtitle="Единый центр управления публичной частью USD 2.0"><LoadingPage/></PageFrame>;
 if(!settings)return <PageFrame title="Настройки сайта" subtitle="Единый центр управления публичной частью USD 2.0"><ErrorPanel message={error||'Настройки не найдены'} retry={load}/></PageFrame>;
 const patch=(section:string,value:any)=>setSettings((s:any)=>({...s,[section]:value}));
 const save=async()=>{setSaving(true);setSaved(false);setError('');try{await updateSiteSettings(settings);setSaved(true)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить настройки')}finally{setSaving(false)}};
 const setBrandingUrl=(key:string,value:string)=>{setPreview(x=>({...x,[key]:value}));patch('branding',{...settings.branding,[key]:value||null})};
 const blocks=settings.homepage.blocks??[];
 const moveBlock=(index:number,to:number)=>{if(to<0||to>=blocks.length)return;const next=[...blocks];const [item]=next.splice(index,1);next.splice(to,0,item);patch('homepage',{...settings.homepage,blocks:next})};
 const setBlock=(id:string,field:string,value:any)=>patch('homepage',{...settings.homepage,blocks:blocks.map((b:any)=>b.id===id?{...b,[field]:value}:b)});
 return <PageFrame title="Настройки сайта" subtitle="Публичный сайт, бренд, главная, LIVE, SEO и контент" action={<div className="settings-save-actions">{saved&&<span className="save-ok"><Check size={14}/>Сохранено</span>}<button className="primary-button compact" onClick={()=>void save()} disabled={saving}>{saving?<><Loader2 size={14} className="spin"/>Сохраняем…</>:<><Check size={14}/>Сохранить всё</>}</button></div>}>
  <div className="settings-layout"><aside className="settings-tabs">{[['branding','Брендинг',Settings2],['homepage','Главная',LayoutDashboard],['stream','Трансляция',Activity],['live','Результаты LIVE',Trophy],['contacts','Контакты',Users],['seo','SEO',Search],['legal','Юридическое',FileClock],['registration','Регистрация',ClipboardCheck],['footer','Подвал',Flag]].map(([id,label,I]:any)=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}><I size={16}/><span>{label}</span></button>)}</aside><section className="settings-content">{error&&<div className="notice"><AlertTriangle size={16}/>{error}</div>}
   {tab==='branding'&&<div className="settings-section"><PanelTitle title="Брендинг" icon={Settings2}/><p className="settings-help">Логотип, favicon и основные параметры публичного сайта сохраняются из админки. Для изображений можно указать стабильный публичный URL.</p><div className="asset-grid">{[['logoUrl','Логотип шапки','URL изображения'],['mobileLogoUrl','Мобильный логотип','URL изображения'],['faviconUrl','Иконка вкладки','URL PNG/ICO']].map(([key,title,hint]:any)=><div className="asset-card" key={key}><div className="asset-preview">{(preview[key]||settings.branding[key])?<img src={preview[key]||settings.branding[key]} alt=""/>:<span>USD</span>}</div><strong>{title}</strong><small>{hint}</small><input value={preview[key]??settings.branding[key]??''} placeholder="https://..." onChange={e=>setBrandingUrl(key,e.target.value)}/></div>)}</div><div className="settings-form-grid"><label>Название сайта<input value={settings.branding.siteName??''} onChange={e=>patch('branding',{...settings.branding,siteName:e.target.value})}/></label><label>Название организации<input value={settings.branding.organizationName??''} onChange={e=>patch('branding',{...settings.branding,organizationName:e.target.value})}/></label></div></div>}
   {tab==='homepage'&&<div className="settings-section"><PanelTitle title="Конструктор главной" icon={LayoutDashboard}/><p className="settings-help">Блоки можно включать, выключать и менять местами. Порядок сохраняется и будет использоваться публичной частью.</p><div className="settings-form-grid"><label>Заголовок<input value={settings.homepage.heroTitle??''} onChange={e=>patch('homepage',{...settings.homepage,heroTitle:e.target.value})}/></label><label>Подзаголовок<input value={settings.homepage.heroSubtitle??''} onChange={e=>patch('homepage',{...settings.homepage,heroSubtitle:e.target.value})}/></label></div><div className="block-sort-list">{blocks.map((b:any,i:number)=><div className="block-sort-row" key={b.id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',String(i))} onDragOver={e=>e.preventDefault()} onDrop={e=>{const from=Number(e.dataTransfer.getData('text/plain'));moveBlock(from,i)}}><span className="drag-handle">⋮⋮</span><div><strong>{b.title||b.id}</strong><small>{b.id}</small></div><input value={b.title??''} onChange={e=>setBlock(b.id,'title',e.target.value)}/><button className="icon-button" onClick={()=>moveBlock(i,i-1)} disabled={i===0}>↑</button><button className="icon-button" onClick={()=>moveBlock(i,i+1)} disabled={i===blocks.length-1}>↓</button><button className={`toggle-button ${b.enabled?'on':''}`} onClick={()=>setBlock(b.id,'enabled',!b.enabled)}>{b.enabled?'Включён':'Скрыт'}</button></div>)}</div></div>}
   {tab==='stream'&&<div className="settings-section"><PanelTitle title="Прямая трансляция" icon={Activity}/><p className="settings-help">Настрой трансляцию заранее. В день этапа блок может автоматически появляться на главной.</p><div className="settings-form-grid"><label className="checkbox-row"><input type="checkbox" checked={!!settings.stream.enabled} onChange={e=>patch('stream',{...settings.stream,enabled:e.target.checked})}/>Показывать трансляцию</label><label>Провайдер<select value={settings.stream.provider??'YOUTUBE'} onChange={e=>patch('stream',{...settings.stream,provider:e.target.value})}><option>YOUTUBE</option><option>VK</option><option>RUTUBE</option><option>CUSTOM</option></select></label><label>Название трансляции<input value={settings.stream.title??''} onChange={e=>patch('stream',{...settings.stream,title:e.target.value})}/></label><label>Ссылка на трансляцию<input value={settings.stream.url??''} onChange={e=>patch('stream',{...settings.stream,url:e.target.value})}/></label><label>Embed URL<input value={settings.stream.embedUrl??''} onChange={e=>patch('stream',{...settings.stream,embedUrl:e.target.value})}/></label><label className="checkbox-row"><input type="checkbox" checked={!!settings.stream.autoShowOnStageDay} onChange={e=>patch('stream',{...settings.stream,autoShowOnStageDay:e.target.checked})}/>Автоматически показывать в день этапа</label><label className="checkbox-row"><input type="checkbox" checked={!!settings.stream.showChat} onChange={e=>patch('stream',{...settings.stream,showChat:e.target.checked})}/>Показывать чат</label></div></div>}
   {tab==='live'&&<div className="settings-section"><PanelTitle title="Результаты LIVE" icon={Trophy}/><p className="settings-help">Публичный фронт сможет автоматически обновлять результаты. Интервал 2–60 секунд.</p><div className="settings-form-grid"><label className="checkbox-row"><input type="checkbox" checked={!!settings.liveResults.enabled} onChange={e=>patch('liveResults',{...settings.liveResults,enabled:e.target.checked})}/>LIVE-результаты включены</label><label>Этап LIVE<input value={settings.liveResults.stageId??''} onChange={e=>patch('liveResults',{...settings.liveResults,stageId:e.target.value||null})} placeholder="ID этапа"/></label><label>Автообновление, сек.<input type="number" min="2" max="60" value={settings.liveResults.refreshSeconds??5} onChange={e=>patch('liveResults',{...settings.liveResults,refreshSeconds:Number(e.target.value)})}/></label><label className="checkbox-row"><input type="checkbox" checked={!!settings.liveResults.showOnlyPublished} onChange={e=>patch('liveResults',{...settings.liveResults,showOnlyPublished:e.target.checked})}/>Показывать только опубликованные результаты</label></div></div>}
   {tab==='contacts'&&<SettingsMap title="Контакты и соцсети" section="contacts" settings={settings} patch={patch} fields={['phone','email','address','telegram','vk','youtube','rutube','whatsapp']}/>}
   {tab==='seo'&&<SettingsMap title="SEO" section="seo" settings={settings} patch={patch} fields={['title','description','keywords','ogTitle','ogDescription','ogImage','canonical']}/>}
   {tab==='legal'&&<SettingsMap title="Юридическая информация" section="legal" settings={settings} patch={patch} fields={['ipName','inn','ogrnip','copyrightHolder','privacyUrl','consentUrl','termsUrl','rulesUrl']}/>}
   {tab==='footer'&&<SettingsMap title="Подвал сайта" section="footer" settings={settings} patch={patch} fields={['copyright','text','phone','email']}/>}
   {tab==='registration'&&<SettingsMap title="Регистрация" section="registration" settings={settings} patch={patch} fields={['enabled','price','additionalClassPrice','introText','successText','rulesText']}/>}
  </section></div></PageFrame>
}
function SettingsMap({title,section,settings,patch,fields}:{title:string;section:string;settings:any;patch:(s:string,v:any)=>void;fields:string[]}){const data=settings[section]??{};return <div className="settings-section"><PanelTitle title={title} icon={Settings2}/><div className="settings-form-grid">{fields.map(k=><label key={k}>{k}<input value={typeof data[k]==='boolean'?'':data[k]??''} type={typeof data[k]==='boolean'?'checkbox':'text'} checked={typeof data[k]==='boolean'?data[k]:undefined} onChange={e=>patch(section,{...data,[k]:typeof data[k]==='boolean'?e.target.checked:e.target.value})}/></label>)}</div></div>}

function GlobalSearch({onClose,go}:{onClose:()=>void;go:(p:string)=>void}){
 const[q,setQ]=useState(''),[results,setResults]=useState<any[]>([]),[loading,setLoading]=useState(false);
 useEffect(()=>{const t=setTimeout(async()=>{if(q.trim().length<2){setResults([]);return}setLoading(true);try{const r=await apiGet<any>('/statistics/participants?search='+encodeURIComponent(q.trim())+'&limit=12');const ps=listData(r).map((x:any)=>({type:'Участник',title:[x.lastName,x.firstName,x.middleName].filter(Boolean).join(' '),path:'/admin/participants'}));const cs=listData(await apiGet<any>('/cars')).filter((x:any)=>JSON.stringify(x).toLowerCase().includes(q.toLowerCase())).slice(0,8).map((x:any)=>({type:'Автомобиль',title:[x.brand,x.model,x.registrationNumber].filter(Boolean).join(' '),path:'/admin/cars'}));setResults([...ps,...cs])}catch{setResults([])}finally{setLoading(false)}},220);return()=>clearTimeout(t)},[q]);
 return <div className="search-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="global-search"><div className="global-search-head"><Search size={18}/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Участник, автомобиль, госномер…"/><button className="icon-button" onClick={onClose}><X size={17}/></button></div>{loading?<LoadingPage small/>:results.length?<div className="global-search-results">{results.map((r,i)=><button key={i} onClick={()=>{onClose();go(r.path)}}><span>{r.type}</span><strong>{r.title}</strong><ChevronRight size={16}/></button>)}</div>:<div className="global-search-empty">{q.length>1?'Ничего не найдено':'Начни вводить минимум 2 символа'}</div>}</div></div>}

function Coming({title,icon:Icon,user}:{title:string;icon:any;user:User}){return <PageFrame title={title} subtitle={user.role==='JUDGE'?'Раздел доступен в режиме судьи':'Управление разделом USD 2.0'}><div className="panel feature-placeholder"><div className="placeholder-icon"><Icon size={28}/></div><h2>Раздел готовится</h2><p>Каркас подключён. Интерфейс будет расширяться поверх реального API без изменения серверных прав.</p></div></PageFrame>}

function PageFrame({title,subtitle,children,action}:{title:string;subtitle:string;children:React.ReactNode;action?:React.ReactNode}){return <div className="page"><div className="page-heading"><div><div className="eyebrow">USD 2.0</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>{children}</div>}
function PanelTitle({title,icon:Icon,action,onAction}:{title:string;icon:any;action?:string;onAction?:()=>void}){return <div className="panel-title"><div><Icon size={17}/><h2>{title}</h2></div>{action&&<button className="text-button" onClick={onAction}>{action}<ChevronRight size={14}/></button>}</div>}
function DataTable({rows,columns,onEdit,onDelete}:{rows:any[];columns:{key:string;label:string}[];onEdit?:(row:any)=>void;onDelete?:(id:string)=>void}){if(!rows.length)return <Empty text="Записей пока нет"/>;return <table className="data-table"><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}{(onEdit||onDelete)&&<th/>}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id??i}>{columns.map(c=><td key={c.key}>{formatCell(getPath(r,c.key))}</td>)}{(onEdit||onDelete)&&<td className="row-actions">{onEdit&&<button className="icon-button" onClick={()=>onEdit(r)} title="Изменить">✎</button>}{onDelete&&r.id&&<button className="icon-button danger" onClick={()=>void onDelete(r.id)} title="Удалить">×</button>}</td>}</tr>)}</tbody></table>}
function autoColumns(rows:any[]){const first=rows[0]??{};return Object.keys(first).filter(k=>!['id','createdAt','updatedAt','deletedAt'].includes(k)&&!k.endsWith('Id')&&!k.endsWith('Ids')&&typeof first[k]!=='object').slice(0,8).map(k=>({key:k,label:humanize(k)}))}
function getPath(o:any,path:string){return path.split('.').reduce((a,k)=>a?.[k],o)}
function formatCell(v:any){if(v===null||v===undefined)return '—';if(typeof v==='boolean')return v?<span className="badge good"><Check size={11}/>Да</span>:<span className="badge">Нет</span>;if(typeof v==='string'&&v.includes('T')&&!Number.isNaN(Date.parse(v)))return formatDate(v);return String(v)}
function humanize(s:string){return s.replace(/([A-Z])/g,' $1').replace(/[_-]/g,' ').replace(/^./,x=>x.toUpperCase())}
function EntityForm({fields,initial,saving,relationOptions={},onSubmit}:{fields:Field[];initial:any;saving:boolean;relationOptions?:Record<string,any[]>;onSubmit:(v:any)=>Promise<void>}){const[v,setV]=useState<any>(initial??{});return <form className="form modal-form" onSubmit={e=>{e.preventDefault();void onSubmit(clean(v))}}>{fields.map(f=>{const opts=relationOptions[f.name]??[];return <label key={f.name} className={f.type==='checkbox'?'checkbox-row':''}>{f.type==='checkbox'?<><input type="checkbox" checked={v[f.name]===true} onChange={e=>setV({...v,[f.name]:e.target.checked})}/>{f.label}</>:f.optionsPath?<select value={v[f.name]??''} onChange={e=>setV({...v,[f.name]:e.target.value})} required={f.required}><option value="">Выберите…</option>{opts.map(o=><option key={o.id} value={o.id}>{f.optionLabel?f.optionLabel(o):o.name??o.id}</option>)}</select>:f.options?<select value={v[f.name]??''} onChange={e=>setV({...v,[f.name]:e.target.value})} required={f.required}><option value="">—</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>:f.type==='textarea'?<textarea rows={4} value={v[f.name]??''} onChange={e=>setV({...v,[f.name]:e.target.value})}/>:<input type={f.type??'text'} value={v[f.name]??''} onChange={e=>setV({...v,[f.name]:f.type==='number'?(e.target.value===''?undefined:Number(e.target.value)):e.target.value} )} required={f.required}/>}</label>})}<button className="primary-button" disabled={saving}>{saving?<><Loader2 className="spin" size={15}/>Сохраняем…</>:'Сохранить'}</button></form>}
function clean(v:any){return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==''&&x!==undefined))}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><div className="modal-head"><strong>{title}</strong><button className="icon-button" onClick={onClose}><X size={17}/></button></div>{children}</div></div>}
function LoadingPage({small=false}:{small?:boolean}){return <div className={small?'loading-small':'loading-page'}><Loader2 className="spin"/><span>Загрузка…</span></div>}
function ErrorPanel({message,retry}:{message:string;retry:()=>Promise<any>|any}){return <div className="error-panel"><AlertTriangle/><div><strong>Не удалось загрузить данные</strong><p>{message}</p><button className="text-button" onClick={()=>void retry()}>Повторить</button></div></div>}
function Empty({text}:{text:string}){return <div className="empty-state"><Activity size={20}/><span>{text}</span></div>}
function formatDate(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric'}).format(d)}
export default App;
