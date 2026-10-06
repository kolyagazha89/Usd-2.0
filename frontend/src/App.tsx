import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {Activity,AlertTriangle,Bot,Code2,CheckCircle2,LockKeyhole,Sparkles,BarChart3,Bell,CalendarDays,CarFront,Check,ChevronRight,ClipboardCheck,Database,FileClock,FileInput,Flag,Gauge,History,LayoutDashboard,Loader2,LogOut,Menu,Plus,RefreshCw,Search,Settings2,ShieldAlert,Trophy,UserRound,Users,X,Pencil,Trash2,Info} from 'lucide-react';
import {apiDelete,apiGet,apiPatch,apiPost,apiPut,getAudit,getDashboard,getDataQuality,connectGoogle,getGoogleSheetValues,getGoogleSpreadsheet,getGoogleSpreadsheets,getGoogleStatus,listData,login,logout,refresh,getSiteSettings,getPublicSiteSettings,updateSiteSettings,uploadSiteAsset,getMediaUrl,getPublicSiteAsset,getAssistantRequests,chatAssistant,createAssistantRequest,submitAssistantRequest,approveAssistantRequest,rejectAssistantRequest,applyAssistantRequest,getAssistantFunctions,executeAssistantFunction,findHistoricalProfileCandidates,linkHistoricalProfile,type Dashboard,type Role,type User} from './api';

const nav=[
 {section:'Рабочий стол',label:'Панель управления',path:'/admin',icon:LayoutDashboard,roles:['ADMIN','JUDGE']},
 {section:'Соревнование',label:'Этапы',path:'/admin/stages',icon:Flag,roles:['ADMIN','JUDGE']},
 {section:'Соревнование',label:'Регистрации',path:'/admin/registrations',icon:ClipboardCheck,roles:['ADMIN','JUDGE']},
 {section:'Соревнование',label:'Инспекции',path:'/admin/inspections',icon:ShieldAlert,roles:['ADMIN','JUDGE']},
 {section:'Соревнование',label:'Результаты',path:'/admin/results',icon:Trophy,roles:['ADMIN','JUDGE']},
 {section:'Справочники',label:'Участники',path:'/admin/participants',icon:Users,roles:['ADMIN']},
 {section:'Справочники',label:'Автомобили',path:'/admin/cars',icon:CarFront,roles:['ADMIN']},
 {section:'Справочники',label:'Сезоны',path:'/admin/seasons',icon:CalendarDays,roles:['ADMIN']},
 {section:'Справочники',label:'Классы',path:'/admin/classes',icon:Gauge,roles:['ADMIN']},
 {section:'Контроль',label:'Дисквалификации',path:'/admin/disqualifications',icon:AlertTriangle,roles:['ADMIN']},
 {section:'Контроль',label:'Рекорды',path:'/admin/records',icon:Trophy,roles:['ADMIN','JUDGE']},
 {section:'Контроль',label:'Статистика',path:'/admin/statistics',icon:BarChart3,roles:['ADMIN','JUDGE']},
 {section:'Данные',label:'Импорт',path:'/admin/import',icon:FileInput,roles:['ADMIN']},
 {section:'Данные',label:'История результатов',path:'/admin/historical-results',icon:History,roles:['ADMIN']},
 {section:'Данные',label:'Контроль данных',path:'/admin/data-quality',icon:Database,roles:['ADMIN']},
 {section:'Система',label:'Пользователи',path:'/admin/users',icon:UserRound,roles:['ADMIN']},
 {section:'Система',label:'Аудит',path:'/admin/audit',icon:FileClock,roles:['ADMIN']},
 {section:'Система',label:'Партнёры',path:'/admin/partners',icon:Users,roles:['ADMIN']},
 {section:'Система',label:'Настройки сайта',path:'/admin/site-settings',icon:Settings2,roles:['ADMIN']},
 {section:'Система',label:'Ассистент USD',path:'/admin/assistant',icon:Bot,roles:['ADMIN']},
];
const roleName:Record<Role,string>={ADMIN:'Администратор',JUDGE:'Судья',PARTICIPANT:'Участник'};

function App(){
 const[user,setUser]=useState<User|null>(null),[booting,setBooting]=useState(true),[path,setPath]=useState(location.pathname),[mobileOpen,setMobileOpen]=useState(false);
 useEffect(()=>{void getPublicSiteAsset('branding-faviconUrl').then(r=>{if(r?.url){let link=document.querySelector<HTMLLinkElement>('link[rel="icon"]');if(!link){link=document.createElement('link');link.rel='icon';document.head.appendChild(link)}link.href=r.url}}).catch(()=>{});document.title='USD — Админ-панель'},[]);
 useEffect(()=>{refresh().then(r=>setUser(r?.user??null)).finally(()=>setBooting(false));const f=()=>setPath(location.pathname);addEventListener('popstate',f);return()=>removeEventListener('popstate',f)},[]);
 const go=(p:string)=>{history.pushState({},'',p);setPath(p);setMobileOpen(false)};
 if(booting)return <Splash/>;
 if(!user)return <LoginScreen onLogin={async(e,p)=>{const loggedInUser=await login(e,p);setUser(loggedInUser);if(loggedInUser.role!=='PARTICIPANT'&&location.pathname==='/')go('/admin')}}/>;
 if(user.role==='PARTICIPANT')return <ParticipantPortal user={user} onUserChange={setUser} onLogout={async()=>{await logout();setUser(null)}}/>;
 return <Shell user={user} path={path} go={go} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} onLogout={async()=>{await logout();setUser(null);go('/')}}/>;
}
function Splash(){const[logo,setLogo]=useState(()=>{try{return localStorage.getItem('usd_splash_logo')??''}catch{return''}});const[loaded,setLoaded]=useState(()=>{try{return (localStorage.getItem('usd_splash_logo')??'').startsWith('data:')}catch{return false}});useEffect(()=>{let active=true;const show=(url:string)=>{if(!url||!active)return;const img=new Image();img.decoding='async';img.onload=()=>{if(!active)return;setLogo(url);setLoaded(true);try{localStorage.setItem('usd_splash_logo',url)}catch{}};img.onerror=()=>{if(active&&url===logo)setLoaded(false)};img.src=url};try{const cached=localStorage.getItem('usd_splash_logo')??'';if(cached&&!cached.startsWith('data:'))show(cached)}catch{};getPublicSiteSettings().then(r=>{const url=r?.settings?.branding?.splashLogoUrl||r?.settings?.branding?.logoUrl;if(url)show(url)}).catch(()=>{});return()=>{active=false}},[]);return <div className="splash"><div className="splash-brand">{logo&&loaded?<img src={logo} alt="USD" decoding="async"/>:<div className="brand-mark">USD</div>}</div><div className="loader"/></div>}
function LoginScreen({onLogin}:{onLogin:(e:string,p:string)=>Promise<void>}){
  const[logo,setLogo]=useState('');
  useEffect(()=>{getPublicSiteAsset('branding-logoUrl').then(r=>setLogo(r.url)).catch(()=>{})},[]);const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);return <div className="login-page"><div className="login-grid"/><div className="login-card"><div className="brand-lockup">{logo?<img className="brand-logo-login" src={logo} alt="USD"/>:<div className="brand-mark">USD</div>}</div><div className="eyebrow">Система управления соревнованиями</div><h1>С возвращением</h1><p className="muted">Войдите в административную панель USD.</p><form className="form" onSubmit={async e=>{e.preventDefault();setError('');setLoading(true);try{await onLogin(email,password)}catch(x){setError(x instanceof Error?x.message:'Не удалось выполнить вход')}finally{setLoading(false)}}}><label>Email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="username" required/></label><label>Пароль<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required/></label>{error&&<div className="form-error"><AlertTriangle size={16}/>{error}</div>}<button className="primary-button" disabled={loading}>{loading?'Входим…':'Войти'}<ChevronRight size={18}/></button></form><div className="login-footer"><span>{logo?<img className="brand-logo-footer" src={logo} alt="USD"/>:<strong>USD</strong>}</span><span>Защищённый вход</span></div></div></div>}
function ParticipantPortal({user,onUserChange,onLogout}:{user:User;onUserChange:(u:User)=>void;onLogout:()=>Promise<void>}){
 const[name,setName]=useState(''),[candidates,setCandidates]=useState<any[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const search=async()=>{setError('');setLoading(true);try{const r=await findHistoricalProfileCandidates(name);setCandidates(r.candidates??[])}catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить поиск')}finally{setLoading(false)}};
 const link=async(id:string)=>{setError('');setLoading(true);try{await linkHistoricalProfile(id);const r=await refresh();if(r?.user)onUserChange(r.user)}catch(e){setError(e instanceof Error?e.message:'Не удалось привязать профиль')}finally{setLoading(false)}};
 const create=async()=>{const parts=name.trim().split(/\\s+/).filter(Boolean);if(parts.length<2){setError('Укажите минимум фамилию и имя');return}setLoading(true);try{await apiPost('/participants/me',{lastName:parts[0],firstName:parts[1],middleName:parts.slice(2).join(' ')||null,isPublic:true});const r=await refresh();if(r?.user)onUserChange(r.user)}catch(e){setError(e instanceof Error?e.message:'Не удалось создать профиль')}finally{setLoading(false)}};
 if(user.participantId)return <div className="center-page"><div className="empty-card"><div className="brand-mark">USD</div><h2>Личный кабинет участника</h2><p className="muted">Профиль привязан. Здесь будет ваша история выступлений, автомобили и регистрации.</p><button className="secondary-button" onClick={()=>void onLogout()}>Выйти</button></div></div>;
 return <div className="center-page"><div className="empty-card participant-match-card"><div className="brand-mark">USD</div><div className="eyebrow">Личный кабинет участника</div><h2>Найти вашу историю USD</h2><p className="muted">Если вы уже участвовали в USD, мы найдём исторический профиль и предложим связать его с вашим аккаунтом.</p><label>Фамилия, имя и отчество<input value={name} onChange={e=>setName(e.target.value)} placeholder="Иванов Иван Иванович" autoComplete="name"/></label><button className="primary-button" onClick={()=>void search()} disabled={loading||name.trim().length<3}>{loading?'Ищем…':'Найти мою историю'}<ChevronRight size={18}/></button>{error&&<div className="form-error"><AlertTriangle size={16}/>{error}</div>}{candidates.map((c:any)=><div className="historical-match-card" key={c.id}><div><strong>{[c.lastName,c.firstName,c.middleName].filter(Boolean).join(' ')}</strong><span>{[c.team,c.city].filter(Boolean).join(' · ')||'Исторический участник'}</span><small>{c._count?.registrations??0} выступлений</small></div><button className="primary-button compact" onClick={()=>void link(c.id)} disabled={loading}>Да, это я</button></div>)}{!loading&&name.trim().length>=3&&candidates.length===0&&<><p className="muted">Совпадений не найдено.</p><button className="secondary-button" onClick={()=>void create()}>Создать новый профиль</button></>}<button className="text-button" onClick={()=>void onLogout()}>Выйти</button></div></div>;
}

function AccessDenied({onLogout}:{onLogout:()=>Promise<void>}){return <div className="center-page"><div className="empty-card"><ShieldAlert size={36}/><h2>Нет доступа к панели</h2><p className="muted">Учётная запись участника не имеет доступа к административной панели.</p><button className="secondary-button" onClick={()=>void onLogout()}>Выйти</button></div></div>}

function Shell({user,path,go,mobileOpen,setMobileOpen,onLogout}:{user:User;path:string;go:(p:string)=>void;mobileOpen:boolean;setMobileOpen:(v:boolean)=>void;onLogout:()=>Promise<void>}){
  const[logo,setLogo]=useState('');
  useEffect(()=>{getMediaUrl('SITE_ASSET','branding-logoUrl').then(setLogo).catch(()=>{})},[]);
 const visible=useMemo(()=>nav.filter(n=>n.roles.includes(user.role)),[user.role]),active=visible.find(n=>path===n.path||(n.path!=='/admin'&&path.startsWith(n.path))),groups=useMemo(()=>visible.reduce((acc:any[],item:any)=>{let g=acc.find(x=>x.name===item.section);if(!g){g={name:item.section,items:[]};acc.push(g)}g.items.push(item);return acc},[]),[visible]);
 const[fieldMode,setFieldMode]=useState(()=>localStorage.getItem('usd.fieldMode')==='1');
 const[searchOpen,setSearchOpen]=useState(false);
 useEffect(()=>{localStorage.setItem('usd.fieldMode',fieldMode?'1':'0');document.documentElement.classList.toggle('field-mode',fieldMode);return()=>document.documentElement.classList.remove('field-mode')},[fieldMode]);
 useEffect(()=>{const h=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(true)}if(e.key==='Escape')setSearchOpen(false)};addEventListener('keydown',h);return()=>removeEventListener('keydown',h)},[]);
 return <div className="app-shell"><aside className={`sidebar ${mobileOpen?'open':''}`}><div className="sidebar-top"><button className="brand-button" onClick={()=>go('/admin')}><span className="brand-mark small">{logo?<img className="brand-logo-shell" src={logo} alt="USD"/>:"USD"}</span><span className="brand-title">USD</span></button><button className="icon-button mobile-close" onClick={()=>setMobileOpen(false)}><X size={19}/></button></div><div className="sidebar-label">Управление</div><nav>{groups.map((g:any)=><div className="nav-group" key={g.name}><div className="nav-group-title">{g.name}</div>{g.items.map((n:any)=>{const I=n.icon;return <button key={n.path} className={`nav-item ${active?.path===n.path?'active':''}`} onClick={()=>go(n.path)}><I size={17}/><span>{n.label}</span>{active?.path===n.path&&<span className="nav-dot"/>}</button>})}</div>)}</nav><div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{(user.name??user.email).slice(0,1).toUpperCase()}</div><div><strong>{user.name||'Пользователь'}</strong><small>{roleName[user.role]}</small></div></div><button className="logout-button" onClick={()=>void onLogout()}><LogOut size={17}/>Выйти</button></div></aside>{mobileOpen&&<button className="mobile-backdrop" onClick={()=>setMobileOpen(false)}/>}<main className="main"><header className="topbar"><button className="icon-button menu-button" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><button className="global-search-trigger" onClick={()=>setSearchOpen(true)}><Search size={15}/><span>Быстрый поиск</span><kbd>Ctrl K</kbd></button><div className="breadcrumb"><span>USD</span><ChevronRight size={14}/><strong>{active?.label??'Панель'}</strong></div><div className="topbar-actions"><button className={`field-status ${fieldMode?'active':''}`} title="Режим для работы на площадке: крупнее элементы, меньше второстепенных деталей" onClick={()=>setFieldMode(v=>!v)}><span className="field-status-dot"/>{fieldMode?'ПОЛЕВОЙ РЕЖИМ ON':'ПОЛЕВОЙ РЕЖИМ'}</button><div className="role-pill">{roleName[user.role]}</div><button className="topbar-refresh" title="Обновить страницу" onClick={()=>window.location.reload()}><RefreshCw size={16}/></button></div></header><div className="content"><Page path={path} go={go} user={user}/></div></main>{searchOpen&&<GlobalSearch onClose={()=>setSearchOpen(false)} go={go}/>}</div>
}

function Page({path,go,user}:{path:string;go:(p:string)=>void;user:User}){
 if(path==='/admin'||path==='/admin/')return <DashboardPage go={go}/>;
 if(path.startsWith('/admin/participants'))return <ParticipantsPage go={go}/>;
 if(path.startsWith('/admin/cars'))return <CarsPage user={user}/>;
 if(path.startsWith('/admin/seasons'))return <SeasonsPage/>;
 if(path.startsWith('/admin/stages/'))return <StageDetailPage stageId={path.split('/')[3]} go={go}/>;
 if(path.startsWith('/admin/stages'))return <StagesPage go={go} user={user}/>
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
 if(path.startsWith('/admin/partners'))return <PartnersPage/>;
 if(path.startsWith('/admin/site-settings'))return <SiteSettingsPage/>;
 if(path.startsWith('/admin/assistant'))return <AssistantPage go={go}/>;
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
 return <PageFrame title="Панель управления" subtitle="Операционный центр USD" action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
  <section className="dashboard-kpis">
   <button className="dashboard-kpi" onClick={()=>go('/admin/participants')}><span><Users size={16}/>Участники</span><strong>{ov.participants.toLocaleString('ru-RU')}</strong><small>в базе</small></button>
   <button className="dashboard-kpi" onClick={()=>go('/admin/cars')}><span><CarFront size={16}/>Автомобили</span><strong>{ov.cars.toLocaleString('ru-RU')}</strong><small>активных</small></button>
   <button className="dashboard-kpi" onClick={()=>go('/admin/registrations')}><span><ClipboardCheck size={16}/>Регистрации</span><strong>{regs.registrations.toLocaleString('ru-RU')}</strong><small>{regs.participants} участников · {regs.cars} авто</small></button>
   <button className="dashboard-kpi" onClick={()=>go('/admin/results')}><span><Trophy size={16}/>Результаты</span><strong>{(ov.appearances??ov.results??0).toLocaleString('ru-RU')}</strong><small>учтённых выступлений</small></button>
  </section>
  <section className="dashboard-main-grid">
   <div className="panel dashboard-stage-card">
    <PanelTitle title={stage?'Рабочий этап':'Ближайший этап'} icon={Flag} action="Открыть этап" onAction={()=>stage&&go('/admin/stages/'+stage.id)}/>
    {stage?<button className="dashboard-feature" onClick={()=>go('/admin/stages/'+stage.id)}>
      <div className="stage-number large">{stage.stageNumber}</div>
      <div className="stage-main"><strong>{stage.name}</strong><span>{stage.city||'—'} · {formatDate(stage.date)}</span><small className="stage-statuses"><span className={'status '+(stage.registrationOpen?'open':'')}>{stage.registrationOpen?'Регистрация открыта':'Регистрация закрыта'}</span><span className={'status status-stage '+String(stage.status||'').toLowerCase()}>{enumLabel(stage.status)}</span></small></div>
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
     <button onClick={()=>go('/admin/stages')}><Activity size={17}/><span>Центр этапа</span></button>
     <button onClick={()=>go('/admin/site-settings')}><Settings2 size={17}/><span>Настройки сайта</span></button>
     <button onClick={()=>go('/admin/assistant')}><Bot size={17}/><span>Ассистент USD</span></button>
    </div>
   </div>
  </section>
  <section className="dashboard-alert-grid">
   <button className={'dashboard-alert '+(a.pendingInspections?'attention':'')} onClick={()=>go('/admin/inspections')}><div><ShieldAlert size={20}/><span>Инспекции</span></div><strong>{a.pendingInspections}</strong><small>{a.pendingInspections?'ожидают проверки':'все проверены'}</small></button>
   <button className={'dashboard-alert '+(a.failedInspections?'danger':'')} onClick={()=>go('/admin/inspections')}><div><AlertTriangle size={20}/><span>Проблемные инспекции</span></div><strong>{a.failedInspections}</strong><small>{a.failedInspections?'требуют внимания':'нарушений не найдено'}</small></button>
   <button className={'dashboard-alert '+(a.unresolvedImports?'danger':'')} onClick={()=>go('/admin/import')}><div><FileInput size={20}/><span>Импорт</span></div><strong>{a.unresolvedImports}</strong><small>{a.unresolvedImports?'загрузок с предупреждениями':'очередь чистая'}</small></button>
   <button className={'dashboard-alert '+(a.activeDisqualifications?'attention':'')} onClick={()=>go('/admin/disqualifications')}><div><AlertTriangle size={20}/><span>Дисквалификации</span></div><strong>{a.activeDisqualifications}</strong><small>{a.activeDisqualifications?'активных':'активных нет'}</small></button>
   <button className="dashboard-alert" onClick={()=>go('/admin/results')}><div><Trophy size={20}/><span>Результаты сегодня</span></div><strong>{a.resultsToday}</strong><small>внесено за сегодня</small></button>
   <button className="dashboard-alert" onClick={()=>go('/admin/records')}><div><Trophy size={20}/><span>Текущие рекорды</span></div><strong>{ov.currentRecords}</strong><small>действующих</small></button>
  </section>
  <section className="dashboard-lower-grid">
   <div className="panel"><PanelTitle title="Ближайшие этапы" icon={CalendarDays} action="Все" onAction={()=>go('/admin/stages')}/>{data.upcomingStages.length?data.upcomingStages.map(s=><button className="stage-row" key={s.id} onClick={()=>go('/admin/stages/'+s.id)}><div className="stage-number">{s.stageNumber}</div><div className="stage-main"><strong>{s.name}</strong><span>{s.city||'—'} · {formatDate(s.date)}</span></div><span className={'status '+(s.registrationOpen?'open':'')}>{s.registrationOpen?'Открыта':'Закрыта'}</span><ChevronRight size={16}/></button>):<Empty text="Нет запланированных этапов"/>}</div>
   <div className="panel"><PanelTitle title="Последние этапы" icon={History} action="Все" onAction={()=>go('/admin/stages')}/>{data.recentStages.length?data.recentStages.map(s=><button className="stage-row" key={s.id} onClick={()=>go('/admin/stages/'+s.id)}><div className="stage-number">{s.stageNumber}</div><div className="stage-main"><strong>{s.name}</strong><span>{s.city||'—'} · {formatDate(s.date)}</span></div><ChevronRight size={16}/></button>):<Empty text="История этапов пока пуста"/>}</div>
  </section>
  <section className="dashboard-system panel">
   <div className="dashboard-system-head"><div><strong>Состояние системы</strong><span>{hasAlerts?'Есть пункты, требующие внимания':'Критичных пунктов нет'}</span></div><span className={'system-status '+(hasAlerts?'warning':'good')}>{hasAlerts?'ТРЕБУЕТ ВНИМАНИЯ':'ВСЁ В ПОРЯДКЕ'}</span></div>
   <div className="dashboard-system-grid">
    <button onClick={()=>go('/admin/stages')}><span>Этапы с открытой регистрацией</span><strong>{a.openStages}</strong><small>можно регистрировать участников</small></button>
    <button onClick={()=>go('/admin/results')}><span>Результаты за сегодня</span><strong>{a.resultsToday}</strong><small>внесено результатов сегодня</small></button>
    <button onClick={()=>go('/admin/records')}><span>Текущие рекорды</span><strong>{ov.currentRecords}</strong><small>действующих рекордов</small></button>
    <button onClick={()=>go('/admin/data-quality')}><span>Контроль данных</span><strong>Открыть</strong><small>проверка целостности данных</small></button>
   </div>
  </section>
 </PageFrame>
}
function StageMini({title,items,go}:{title:string;items:any[];go:(p:string)=>void}){return <div className="panel"><PanelTitle title={title} icon={CalendarDays} action="Все этапы" onAction={()=>go('/admin/stages')}/>{items.length?items.map(s=><button className="stage-row" key={s.id} onClick={()=>go('/admin/stages')}><div className="stage-number">{s.stageNumber}</div><div className="stage-main"><strong>{s.name}</strong><span>{s.city||'—'} · {formatDate(s.date)}</span></div>{s.registrationOpen!==undefined&&<span className={`status ${s.registrationOpen?'open':''}`}>{s.registrationOpen?'Открыта':'Закрыта'}</span>}<ChevronRight size={16}/></button>):<Empty text="Нет данных"/>}</div>}

type Field={name:string;label:string;type?:string;required?:boolean;options?:string[];optionsPath?:string;optionLabel?:(item:any)=>string;placeholder?:string;help?:string};
function ResourcePage({title,subtitle,path,columns,fields,create,update,remove,searchPlaceholder='Поиск',rowAction,showHelp=false,showStatusFilter=true}:{title:string;subtitle:string;path:string;columns:{key:string;label:string}[];fields?:Field[];create?:(v:any)=>Promise<any>;update?:(id:string,v:any)=>Promise<any>;remove?:(id:string)=>Promise<any>;searchPlaceholder?:string;rowAction?:(row:any,reload:()=>Promise<any>)=>React.ReactNode;showHelp?:boolean;showStatusFilter?:boolean}){
 const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[modal,setModal]=useState<any|null>(null),[modalError,setModalError]=useState(''),[saving,setSaving]=useState(false),[relationOptions,setRelationOptions]=useState<Record<string,any[]>>({}),[viewFilter,setViewFilter]=useState<'ALL'|'ACTIVE'|'INACTIVE'>('ALL');
 const load=()=>{setError('');setLoading(true);return apiGet<any>(path).then(r=>setData(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки')).finally(()=>setLoading(false))};useEffect(()=>{void load()},[path]);
 useEffect(()=>{let cancelled=false;const relationFields=(fields??[]).filter(f=>f.optionsPath);if(!relationFields.length)return;Promise.all(relationFields.map(async f=>{try{const r=await apiGet<any>(f.optionsPath!);return [f.name,listData(r)] as const}catch{return [f.name,[]] as const}})).then(entries=>{if(!cancelled)setRelationOptions(Object.fromEntries(entries))});return()=>{cancelled=true}},[fields]);
 const matchesView=(x:any)=>!showStatusFilter||viewFilter==='ALL'||(viewFilter==='ACTIVE'?(x.isActive===true||x.status==='ACTIVE'||x.status==='PUBLISHED'):(x.isActive===false||x.status==='CANCELLED'||x.status==='ARCHIVED'));
 const filtered=data.filter(x=>matchesView(x)&&JSON.stringify(x).toLowerCase().includes(search.toLowerCase()));
 const submit=async(v:any)=>{setSaving(true);setModalError('');try{const payload=fields?Object.fromEntries(fields.map(f=>[f.name,v[f.name]]).filter(([,x])=>x!==''&&x!==undefined)):v;if(modal?.id&&update)await update(modal.id,payload);else if(create)await create(payload);setModal(null);await load()}catch(e){setModalError(e instanceof Error?e.message:'Ошибка сохранения')}finally{setSaving(false)}};
 const activeCount=data.filter(x=>x.isActive===true||x.status==='ACTIVE'||x.status==='PUBLISHED').length;
 const inactiveCount=data.filter(x=>x.isActive===false||x.status==='CANCELLED'||x.status==='ARCHIVED').length;
 return <PageFrame title={title} subtitle={subtitle} showHelp={showHelp} action={<>{fields&&create&&<button className="primary-button compact" onClick={()=>setModal({})}><Plus size={15}/>Добавить</button>}<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button></>}>
  {!loading&&data.length>0&&showStatusFilter&&<div className="admin-mini-stats">
   <div><span>Всего</span><strong>{data.length}</strong></div>
   <div><span>Активных</span><strong>{activeCount}</strong></div>
   <div><span>Неактивных</span><strong>{inactiveCount}</strong></div>
   <div><span>Показано</span><strong>{filtered.length}</strong></div>
  </div>}
  <div className="toolbar resource-toolbar"><div className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={searchPlaceholder}/></div>{showStatusFilter&&<div className="resource-filters"><button className={viewFilter==='ALL'?'selected':''} onClick={()=>setViewFilter('ALL')}>Все <b>{data.length}</b></button><button className={viewFilter==='ACTIVE'?'selected':''} onClick={()=>setViewFilter('ACTIVE')}>Активные <b>{activeCount}</b></button><button className={viewFilter==='INACTIVE'?'selected':''} onClick={()=>setViewFilter('INACTIVE')}>Неактивные <b>{inactiveCount}</b></button></div>}<span className="row-count">{filtered.length} из {data.length}</span></div>
  {error&&<ErrorPanel message={error} retry={load}/>}
  <div className="panel table-wrap">{loading?<LoadingPage small/>:<DataTable rows={filtered} columns={columns} onEdit={update?setModal:undefined} onDelete={remove?async id=>{if(confirm('Удалить запись?')){await remove(id);await load()}}:undefined} extraAction={(row)=>rowAction?.(row,load)}/>}</div>
  {modal!==null&&<Modal title={modal.id?'Редактирование записи':'Новая запись'} onClose={()=>{setModal(null);setModalError('')}}>{modalError&&<div className="form-error modal-form-error"><AlertTriangle size={16}/><span>{modalError}</span></div>}<EntityForm fields={fields??[]} initial={modal} saving={saving} relationOptions={relationOptions} onSubmit={submit}/></Modal>}
 </PageFrame>
}

function ParticipantsPage({go}:{go:(p:string)=>void}){return <ResourcePage title="Участники" subtitle="Профили, команды и история выступлений" path="/admin/participants" columns={[{key:'lastName',label:'Фамилия'},{key:'firstName',label:'Имя'},{key:'city',label:'Город'},{key:'team',label:'Команда'},{key:'phone',label:'Телефон'},{key:'isPublic',label:'Публичный'}]} fields={[{name:'lastName',label:'Фамилия',required:true},{name:'firstName',label:'Имя',required:true},{name:'middleName',label:'Отчество'},{name:'city',label:'Город'},{name:'team',label:'Команда'},{name:'phone',label:'Телефон'},{name:'birthDate',label:'Дата рождения',type:'date'},{name:'isPublic',label:'Показывать профиль публично',type:'checkbox'}]} create={v=>apiPost('/participants',v)} update={(id,v)=>apiPatch('/participants/'+id,v)} remove={id=>apiDelete('/participants/'+id)} searchPlaceholder="ФИО, город, команда" showStatusFilter={false}/>}

function CarsPage({user}:{user:User}){
 const canEdit=user.role==='ADMIN';
 const [cars,setCars]=useState<any[]>([]),[participants,setParticipants]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[modal,setModal]=useState<any|null>(null),[configCar,setConfigCar]=useState<any|null>(null),[saving,setSaving]=useState(false);
 const load=async()=>{setLoading(true);setError('');try{setCars(listData(await apiGet<any>('/cars')))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки автомобилей')}finally{setLoading(false)}};
 useEffect(()=>{void load();apiGet<any>('/admin/participants').then(r=>setParticipants(listData(r))).catch(()=>{})},[]);
 const saveCar=async(v:any)=>{setSaving(true);try{const {participantId,...car}=v;if(modal?.id)await apiPatch('/cars/'+modal.id,car);else await apiPost('/participants/'+encodeURIComponent(participantId)+'/cars',car);setModal(null);await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения автомобиля')}finally{setSaving(false)}};
 const removeCar=async(id:string)=>{if(!window.confirm('Деактивировать автомобиль?'))return;try{await apiDelete('/cars/'+id);await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка деактивации')}};
 const filtered=cars.filter(c=>{const q=search.trim().toLowerCase();if(!q)return true;return [c.brand,c.model,c.registrationNumber,c.registrationCountry,c.color,c.participant?.lastName,c.participant?.firstName,c.participant?.team].filter(Boolean).join(' ').toLowerCase().includes(q)});
 const countries=['RU','NO','FI','EE','LV','LT','PL','BY','UA','GE','AZ','KZ','CN','MN','KP','US'];
 return <PageFrame title="Автомобили" subtitle="Автомобили участников и их конфигурации" action={canEdit?<button className="primary-button compact" onClick={()=>setModal({})}><Plus size={15}/>Добавить автомобиль</button>:undefined}>
  <div className="toolbar"><div className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Марка, модель, госномер, участник"/></div><button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/></button><span className="row-count">{filtered.length} автомобилей</span></div>
  {error&&<div className="notice"><AlertTriangle size={18}/><span>{error}</span></div>}
  <div className="panel table-wrap">{loading?<LoadingPage small/>:<>{filtered.length?<table className="data-table"><thead><tr><th>Автомобиль</th><th>Участник</th><th>Госномер</th><th>Цвет</th><th>Конфигурации</th><th>Статус</th><th/></tr></thead><tbody>{filtered.map(car=><tr key={car.id}><td data-label="Автомобиль"><strong>{car.brand} {car.model}</strong></td><td data-label="Участник">{car.participant?[car.participant.lastName,car.participant.firstName].filter(Boolean).join(' '):'—'}</td><td data-label="Госномер">{car.registrationCountry} · {car.registrationNumber}</td><td data-label="Цвет">{car.color||'—'}</td><td data-label="Конфигурации"><button className="text-button" onClick={()=>setConfigCar(car)}>{car.configurations?.length??0} конф.</button></td><td data-label="Статус"><span className={"badge "+(car.isActive?'good':'')}>{car.isActive?'Активен':'Неактивен'}</span></td><td data-label="Действия" className="row-actions">{canEdit&&<><button className="icon-button" title="Изменить" onClick={()=>setModal(car)}>✎</button>{car.isActive&&<button className="icon-button danger" title="Деактивировать" onClick={()=>void removeCar(car.id)}>×</button>}</>}</td></tr>)}</tbody></table>:<Empty text="Автомобилей пока нет"/>}</>}</div>
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
 const directionName:Record<string,string>={FRONT:'Фронт',REAR:'Тыл',SUB:'Сабвуфер'};
 const typeName:Record<string,string>={SUBWOOFER:'Сабвуфер',MIDBASS:'Мидбас',MIDRANGE:'Среднечастотник',HORN:'Рупор',OTHER:'Другое'};
 const patch=(key:string,i:number,p:any)=>setV((s:any)=>({...s,[key]:s[key].map((x:any,n:number)=>n===i?{...x,...p}:x)}));
 const remove=(key:string,i:number)=>setV((s:any)=>({...s,[key]:s[key].filter((_:any,n:number)=>n!==i)}));
 const add=(key:string,item:any)=>setV((s:any)=>({...s,[key]:[...s[key],item]}));
 const submit=async()=>{setSaving(true);setError('');try{const body=cleanConfig(v);if(isNew)await apiPost('/cars/'+carId+'/configurations',body);else await apiPut('/configurations/'+configuration.id,body);await onSaved()}catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения конфигурации')}finally{setSaving(false)}};
 return <Modal title={isNew?'Новая конфигурация':'Новая версия · '+configuration.name} onClose={onClose}>
  {error&&<div className="form-error"><AlertTriangle size={16}/>{error}</div>}
  <div className="form modal-form config-editor">
   <label>Название конфигурации<input value={v.name} onChange={e=>setV({...v,name:e.target.value})} required/></label><label>Виброизоляция<textarea rows={3} value={v.vibrationIsolation} onChange={e=>setV({...v,vibrationIsolation:e.target.value})}/></label><label>Описание<textarea rows={3} value={v.additionalDescription} onChange={e=>setV({...v,additionalDescription:e.target.value})}/></label>
   <ConfigListEditor title="Головные устройства" items={v.headUnits} onAdd={()=>add('headUnits',{brand:'',model:'',direction:'FRONT'})} onRemove={i=>remove('headUnits',i)}>{(x:any,i:number)=><div className="form-grid-3"><input placeholder="Бренд" value={x.brand} onChange={e=>patch('headUnits',i,{brand:e.target.value})}/><input placeholder="Модель" value={x.model} onChange={e=>patch('headUnits',i,{model:e.target.value})}/><select value={x.direction} onChange={e=>patch('headUnits',i,{direction:e.target.value})}>{directions.map(d=><option key={d}>{directionName[d]}</option>)}</select></div>}</ConfigListEditor>
   <ConfigListEditor title="Аудиокомпоненты" items={v.audioComponents} onAdd={()=>add('audioComponents',{brand:'',model:'',quantity:1,type:'SUBWOOFER',direction:'FRONT'})} onRemove={i=>remove('audioComponents',i)}>{(x:any,i:number)=><div className="form-grid-5"><input placeholder="Бренд" value={x.brand} onChange={e=>patch('audioComponents',i,{brand:e.target.value})}/><input placeholder="Модель" value={x.model} onChange={e=>patch('audioComponents',i,{model:e.target.value})}/><input type="number" min="1" value={x.quantity} onChange={e=>patch('audioComponents',i,{quantity:Number(e.target.value)})}/><select value={x.type} onChange={e=>patch('audioComponents',i,{type:e.target.value})}>{types.map(t=><option key={t}>{typeName[t]}</option>)}</select><select value={x.direction} onChange={e=>patch('audioComponents',i,{direction:e.target.value})}>{directions.map(d=><option key={d}>{d}</option>)}</select></div>}</ConfigListEditor>
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
function InspectionRow({registration:r,user,onSaved,readOnly}:{registration:any;user:User;onSaved:()=>Promise<any>;readOnly:boolean}){
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[noteOpen,setNoteOpen]=useState(false),[notes,setNotes]=useState(r.inspection?.notes??'');
 const inspection=r.inspection, canEdit=!readOnly&&(!inspection||(user.role==='ADMIN'||inspection.checkedByUserId===user.id||inspection.createdByUserId===user.id));
 const save=async(status:'PASSED'|'FAILED')=>{if(status==='FAILED'&&!notes.trim()){setNoteOpen(true);setError('Для статуса «Не прошёл» укажите причину');return}setBusy(true);setError('');try{if(inspection){await apiPatch('/inspections/'+inspection.id,{status,notes:notes.trim()||null})}else{await apiPost('/inspections',{registrationId:r.id,status,notes:notes.trim()||undefined})}await onSaved();setNoteOpen(false)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить инспекцию')}finally{setBusy(false)}};
 const classes=(r.classes??[]).map((x:any)=>x.class?.name).filter(Boolean).join(', '),status=inspection?.status;
 return <tr><td data-label="№"><strong>{r.participantNumber}</strong></td><td data-label="Участник"><strong>{[r.participant?.lastName,r.participant?.firstName].filter(Boolean).join(' ')}</strong>{r.participant?.team&&<small className="table-sub">{r.participant.team}</small>}</td><td data-label="Автомобиль"><strong>{[r.car?.brand,r.car?.model].filter(Boolean).join(' ')}</strong>{r.car?.registrationNumber&&<small className="table-sub">{r.car.registrationNumber}</small>}</td><td data-label="Классы">{classes||'—'}</td><td data-label="Инспекция">{status==='PASSED'?<span className="badge good"><Check size={11}/>Прошёл</span>:status==='FAILED'?<span className="badge bad"><X size={11}/>Не прошёл</span>:<span className="badge">Ожидает</span>}{inspection?.notes&&<small className="table-sub">{inspection.notes}</small>}{error&&<small className="table-sub error-text">{error}</small>}</td><td data-label="Действие">{canEdit?<div className="inspection-actions"><button className="secondary-button compact" disabled={busy} onClick={()=>void save('PASSED')}>{busy?'…':<><Check size={14}/>Прошёл</>}</button><button className="danger-button compact" disabled={busy} onClick={()=>{setNoteOpen(true);setError('')}}><X size={14}/>Не прошёл</button></div>:<span className="muted">Только просмотр</span>}{noteOpen&&canEdit&&<div className="inspection-note"><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Причина непрохождения"/><button className="primary-button compact" disabled={busy} onClick={()=>void save('FAILED')}>{busy?'Сохраняем…':'Подтвердить'}</button></div>}</td></tr>
}
function StageDetailPage({stageId,go}:{stageId:string;go:(p:string)=>void}){const[data,setData]=useState<any|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');const load=()=>{setLoading(true);setError('');return apiGet<any>('/statistics/stages/'+encodeURIComponent(stageId)).then(setData).catch(e=>setError(e instanceof Error?e.message:'Не удалось загрузить этап')).finally(()=>setLoading(false))};useEffect(()=>{void load()},[stageId]);if(error)return <PageFrame title="Этап" subtitle="Статистика этапа" action={<button className="secondary-button compact" onClick={()=>go('/admin/stages')}>К списку этапов</button>}><ErrorPanel message={error} retry={load}/></PageFrame>;if(loading||!data)return <PageFrame title="Этап" subtitle="Загрузка статистики"><LoadingPage/></PageFrame>;const s=data.stage,st=data.stats??{},ins=st.inspections??{};return <PageFrame title={'Этап №'+s.stageNumber+' · '+s.name} subtitle={[s.city,s.season?.name||s.season?.year].filter(Boolean).join(' · ')||'Статистика этапа'} action={<button className="secondary-button compact" onClick={()=>go('/admin/stages')}>К списку этапов</button>}><div className="admin-mini-stats"><div><span>Дата</span><strong>{formatDate(s.date)}</strong></div><div><span>Регистрации</span><strong>{st.registrations}</strong></div><div><span>Участники</span><strong>{st.participants}</strong></div><div><span>Автомобили</span><strong>{st.cars}</strong></div></div><section className="dashboard-kpis"><div className="dashboard-kpi"><span><ClipboardCheck size={16}/>Регистрации</span><strong>{st.registrations}</strong><small>{st.participants} участников · {st.cars} авто</small></div><div className="dashboard-kpi"><span><ShieldAlert size={16}/>Пройдено инспекций</span><strong>{ins.passed??0}</strong><small>из {ins.total??0} оформленных</small></div><div className="dashboard-kpi"><span><Trophy size={16}/>Результаты</span><strong>{st.appearances??0}</strong><small>учтённых выступлений</small></div></section><section className="dashboard-lower-grid"><div className="panel"><PanelTitle title="Инспекции" icon={ShieldAlert}/><div className="admin-mini-stats"><div><span>Прошли</span><strong>{ins.passed??0}</strong></div><div><span>Не прошли</span><strong>{ins.failed??0}</strong></div><div><span>Ожидают</span><strong>{ins.pending??0}</strong></div></div></div><div className="panel"><PanelTitle title="Результаты по классам" icon={Trophy}/>{st.classResults?.length?st.classResults.map((x:any)=><div className="stage-row" key={x.class.id}><div className="stage-main"><strong>{x.class.name}</strong><span>{x.participants} участников · {x.appearances} выступлений</span></div>{x.bestResult&&<strong>{x.bestResult.value} {enumLabel(x.bestResult.unit)}</strong>}</div>):<Empty text="Результатов по классам пока нет"/>}</div></section></PageFrame>}
function StagesPage({go,user}:{go:(p:string)=>void;user:User}){
 const admin=user.role==='ADMIN';
 const [stageClasses,setStageClasses]=useState<any|null>(null),[posterStage,setPosterStage]=useState<any|null>(null);
 const normalizeStage=(v:any,includeSeason=true)=>({stageNumber:Number(v.stageNumber),name:String(v.name??'').trim(),city:v.city?String(v.city).trim():undefined,date:v.date?String(v.date).slice(0,10)+'T12:00:00':undefined,status:v.status||'DRAFT',registrationOpen:!!v.registrationOpen,venue:v.venue?String(v.venue).trim():undefined,address:v.address?String(v.address).trim():undefined,description:v.description?String(v.description).trim():undefined,...(includeSeason&&v.seasonId?{seasonId:v.seasonId}:{})});
 const createStage=async(v:any)=>{const created=await apiPost('/stages',normalizeStage(v));let stage=created?.stage??created?.data??created;let id=stage?.id;if(!id){const xs=listData(await apiGet<any>('/stages'));const found=xs.find((x:any)=>Number(x.stageNumber)===Number(v.stageNumber)&&x.name===String(v.name).trim());id=found?.id}if(id){const classes=listData(await apiGet<any>('/classes'));const active=classes.filter((x:any)=>x.isActive!==false);if(active.length)await apiPut('/stages/'+id+'/classes',{classIds:active.map((x:any)=>x.id)})}};
 return <><ResourcePage title="Этапы" subtitle={admin?'Календарь соревнований':'Календарь этапов'} path="/stages" columns={[{key:'stageNumber',label:'#'},{key:'name',label:'Название'},{key:'city',label:'Город'},{key:'date',label:'Дата'},{key:'status',label:'Статус'},{key:'registrationOpen',label:'Регистрация'}]} fields={admin?[{name:'stageNumber',label:'Номер этапа',type:'number',required:true},{name:'name',label:'Название этапа',required:true},{name:'city',label:'Город'},{name:'date',label:'Дата проведения',type:'date',required:true},{name:'status',label:'Статус',options:['DRAFT','PUBLISHED','COMPLETED','CANCELLED']},{name:'registrationOpen',label:'Регистрация открыта',type:'checkbox'},{name:'venue',label:'Площадка'},{name:'address',label:'Адрес'},{name:'description',label:'Описание',type:'textarea'},{name:'seasonId',label:'Сезон',required:true,optionsPath:'/seasons',optionLabel:(x:any)=>(String(x.year??'')+(x.name?' · '+x.name:'')).trim()}]:undefined} create={admin?createStage:undefined} update={admin?(id,v)=>apiPatch('/stages/'+id,normalizeStage(v,false)):undefined} remove={admin?id=>apiDelete('/stages/'+id):undefined} searchPlaceholder="Название, город" rowAction={admin?((row,reload)=><><button type="button" className="secondary-button compact" onClick={()=>go('/admin/stages/'+row.id)}><ChevronRight size={14}/>Открыть</button><button type="button" className="secondary-button compact" onClick={()=>setStageClasses(row)}>Классы</button><button type="button" className="secondary-button compact" onClick={()=>setPosterStage(row)}>Афиша</button><button type="button" className={'stage-registration-toggle '+(row.registrationOpen?'open':'')} onClick={async()=>{try{await apiPatch('/stages/'+row.id,{registrationOpen:!row.registrationOpen});await reload()}catch(e){alert(e instanceof Error?e.message:'Не удалось изменить регистрацию')}}}>{row.registrationOpen?'Закрыть регистрацию':'Открыть регистрацию'}</button></>):undefined}/>{stageClasses&&<StageClassesModal stage={stageClasses} onClose={()=>setStageClasses(null)}/>} {posterStage&&<StagePosterModal stage={posterStage} onClose={()=>setPosterStage(null)}/>}</>
}
function StagePosterModal({stage,onClose}:{stage:any;onClose:()=>void}){
 const[file,setFile]=useState<File|null>(null),[url,setUrl]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const key='stage-poster-'+stage.id;
 const load=async()=>{setLoading(true);try{const r=await getPublicSiteAsset(key);setUrl(r?.url||'')}catch{}finally{setLoading(false)}};
 useEffect(()=>{void load()},[stage.id]);
 const save=async()=>{if(!file)return;setSaving(true);setError('');try{const r=await uploadSiteAsset(key,file);setUrl(r.url);const settings=await getSiteSettings();await updateSiteSettings({...settings,stagePosters:{...(settings?.stagePosters??{}),[stage.id]:r.publicPath}});setFile(null)}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить афишу')}finally{setSaving(false)}};
 return <Modal title={'Афиша · этап №'+stage.stageNumber+' · '+stage.name} onClose={onClose}>{error&&<div className="form-error"><AlertTriangle size={16}/><span>{error}</span></div>}{loading?<LoadingPage small/>:<div className="poster-modal-content">{url&&<img className="stage-poster-preview" src={url} alt="Афиша этапа"/>}<label>Фотография-афиша<input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]??null)}/><small className="field-help">JPG, PNG или WebP, до 10 МБ.</small></label>{file&&<span className="muted">Выбрано: {file.name}</span>}<button className="primary-button" disabled={!file||saving} onClick={()=>void save()}>{saving?<><Loader2 className="spin" size={15}/>Загружаем…</>:'Загрузить афишу'}</button></div>}</Modal>
}
function StageClassesModal({stage,onClose}:{stage:any;onClose:()=>void}){
 const[classes,setClasses]=useState<any[]>([]),[allClasses,setAllClasses]=useState<any[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const load=async()=>{setLoading(true);setError('');try{const[a,b]=await Promise.all([apiGet<any>('/stages/'+stage.id+'/classes?includeInactive=true'),apiGet<any>('/classes')]);setClasses(listData(a));setAllClasses(listData(b))}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить классы этапа')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[stage.id]);
 const save=async(classId:string,body:any)=>{setSaving(true);setError('');try{await apiPatch('/stages/'+stage.id+'/classes/'+classId,body);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить настройки класса')}finally{setSaving(false)}};
 const addAll=async()=>{const ids=allClasses.filter(x=>x.isActive!==false).map(x=>x.id);if(!ids.length)return;setSaving(true);setError('');try{await apiPut('/stages/'+stage.id+'/classes',{classIds:ids});await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось добавить классы')}finally{setSaving(false)}};
 const remove=async(classId:string)=>{if(!confirm('Убрать этот класс с этапа?'))return;await save(classId,{isActive:false})};
 const activeIds=new Set(classes.filter(x=>x.isActive).map(x=>x.classId));
 return <Modal title={'Классы · этап №'+stage.stageNumber+' · '+stage.name} onClose={onClose}>
  {error&&<div className="notice"><AlertTriangle size={16}/><span>{error}</span></div>}
  {loading?<LoadingPage small/>:<>
   <div className="stage-class-modal-head"><div><strong>Доступные классы</strong><span>{classes.filter(x=>x.isActive).length} из {allClasses.filter(x=>x.isActive!==false).length} активных</span></div><button className="primary-button compact" disabled={saving} onClick={()=>void addAll()}>{saving?'Сохраняем…':'Добавить все классы'}</button></div>
   <div className="stage-class-modal-list">{allClasses.filter(x=>x.isActive!==false).map((x:any)=>{const linked=activeIds.has(x.id);const row=classes.find(s=>s.classId===x.id);return <div className={'stage-class-modal-row '+(linked?'linked':'')} key={x.id}><div><strong>{x.name}</strong><span>{x.direction?.name||'—'} · {enumLabel(x.unit||'DB')}</span></div>{linked?<button className="secondary-button compact" disabled={saving} onClick={()=>void remove(x.id)}>Убрать</button>:<button className="primary-button compact" disabled={saving} onClick={()=>void save(x.id,{isActive:true})}>Добавить</button>}</div>})}</div>
   {classes.filter(x=>x.isActive).map((x:any)=><div className="stage-class-settings" key={'settings-'+x.id}><div><strong>{x.customName||x.class?.name}</strong><span>Настройки этапа</span></div><div className="stage-class-fields"><label>Порядок<input type="number" min="0" value={x.sortOrder??0} onChange={e=>setClasses(xs=>xs.map(y=>y.id===x.id?{...y,sortOrder:Number(e.target.value)}:y))}/></label><label>Лимит участников<input type="number" min="1" placeholder="Без лимита" value={x.participantLimit??''} onChange={e=>setClasses(xs=>xs.map(y=>y.id===x.id?{...y,participantLimit:e.target.value===''?null:Number(e.target.value)}:y))}/></label><label>Название на этапе<input value={x.customName??''} placeholder={x.class?.name||''} onChange={e=>setClasses(xs=>xs.map(y=>y.id===x.id?{...y,customName:e.target.value}:y))}/></label><button className="secondary-button compact" disabled={saving} onClick={()=>void save(x.classId,{sortOrder:x.sortOrder,participantLimit:x.participantLimit,customName:x.customName??null})}>Сохранить</button></div></div>)}
  </>}
 </Modal>
}
function ClassesPage(){const[tab,setTab]=useState<'classes'|'directions'>('classes');return <PageFrame title="Классы" subtitle="Направления, классы и единицы измерения" action={<div className="segmented"><button className={tab==='classes'?'selected':''} onClick={()=>setTab('classes')}>Классы</button><button className={tab==='directions'?'selected':''} onClick={()=>setTab('directions')}>Направления</button></div>}>{tab==='classes'?<ResourcePage title="Классы" subtitle="" path="/classes" columns={[{key:'code',label:'Код'},{key:'name',label:'Название'},{key:'direction.name',label:'Направление'},{key:'unit',label:'Единица'},{key:'isActive',label:'Активен'}]} fields={[{name:'directionId',label:'Направление',required:true,optionsPath:'/directions',optionLabel:(x:any)=>x.name??x.code??x.id},{name:'code',label:'Код',required:true},{name:'name',label:'Название',required:true},{name:'unit',label:'Единица',options:['DB','MPS','OTHER']},{name:'sortOrder',label:'Порядок',type:'number'},{name:'isActive',label:'Активен',type:'checkbox'}]} create={v=>apiPost('/classes',v)} update={(id,v)=>apiPatch('/classes/'+id,v)}/>:<ResourcePage title="Направления" subtitle="" path="/directions" columns={[{key:'name',label:'Название'},{key:'sortOrder',label:'Порядок'},{key:'isActive',label:'Активно'}]} fields={[{name:'name',label:'Название',required:true},{name:'sortOrder',label:'Порядок',type:'number'},{name:'isActive',label:'Активно',type:'checkbox'}]} create={v=>apiPost('/directions',v)} update={(id,v)=>apiPatch('/directions/'+id,v)} remove={id=>apiDelete('/directions/'+id)}/>}</PageFrame>}

function RegistrationsPage(){const[stageId,setStageId]=useState(''),[stages,setStages]=useState<any[]>([]),[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[status,setStatus]=useState<'ACTIVE'|'CANCELLED'|'ALL'>('ACTIVE'),[period,setPeriod]=useState<'UPCOMING'|'PAST'>('UPCOMING');const isPastStage=(s:any)=>s?.status==='COMPLETED'||(s?.date&&new Date(s.date).getTime()<Date.now());const visibleStages=stages.filter(s=>period==='PAST'?isPastStage(s):!isPastStage(s));const selectedStage=stages.find(s=>s.id===stageId),pastStage=isPastStage(selectedStage);const load=async()=>{if(!stageId)return;setLoading(true);setError('');try{const q=pastStage?'':'&status='+status;const r=await apiGet<any>('/registrations?stageId='+encodeURIComponent(stageId)+q);setRows(listData(r))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки')}finally{setLoading(false)}};useEffect(()=>{apiGet('/stages').then(r=>{const s=listData(r);setStages(s);const upcoming=s.filter((x:any)=>!isPastStage(x));const initial=upcoming[0]??s[0];if(initial?.id)setStageId(initial.id)}).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки этапов'))},[]);useEffect(()=>{if(stageId)void load()},[stageId,status,period,pastStage]);const cancel=async(id:string)=>{if(!confirm('Отменить регистрацию?'))return;try{await apiDelete('/registrations/'+id);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось отменить регистрацию')}};return <PageFrame title="Регистрации" subtitle="Регистрации по этапам, автомобилям и классам" action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}><div className="toolbar stage-picker"><label>Период<select value={period} onChange={e=>{const next=e.target.value as 'UPCOMING'|'PAST';setPeriod(next);const nextStages=stages.filter(s=>next==='PAST'?isPastStage(s):!isPastStage(s));setStageId(nextStages[0]?.id??'')}}><option value="UPCOMING">Будущие этапы</option><option value="PAST">Прошедшие этапы</option></select></label><label>Этап<select value={stageId} onChange={e=>setStageId(e.target.value)}><option value="">Выберите этап</option>{visibleStages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}</select></label>{!pastStage&&<select className="filter-select" value={status} onChange={e=>setStatus(e.target.value as any)}><option value="ACTIVE">Активные</option><option value="CANCELLED">Отменённые</option><option value="ALL">Все</option></select>}</div>{pastStage&&<div className="notice"><ClipboardCheck size={16}/><span>Этап завершён. Регистрации доступны только для просмотра — отмена отключена.</span></div>}{error&&<ErrorPanel message={error} retry={load}/>}<div className="panel table-wrap">{loading?<LoadingPage small/>:rows.length?<table className="data-table"><thead><tr><th>№</th><th>Участник</th><th>Автомобиль</th><th>Классы</th><th>Статус</th><th/></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td data-label="№"><strong>{r.participantNumber}</strong></td><td data-label="Участник">{[r.participant?.lastName,r.participant?.firstName,r.participant?.middleName].filter(Boolean).join(' ')||'—'}{r.participant?.team&&<small className="table-sub">{r.participant.team}</small>}</td><td data-label="Автомобиль">{[r.car?.brand,r.car?.model].filter(Boolean).join(' ')||'—'}<small className="table-sub">{r.car?.registrationNumber||'—'}</small></td><td data-label="Классы">{r.classes?.length?r.classes.map((x:any)=>{const n=x.number?.number;return <span key={x.id} className="class-number-chip">{x.class?.name}{n?' №'+n:''}</span>}):'—'}</td><td data-label="Статус"><span className={'badge '+(r.status==='ACTIVE'?'good':'')}>{r.status==='ACTIVE'?'Активна':'Отменена'}</span></td><td data-label="Действия" className="row-actions">{!pastStage&&r.status==='ACTIVE'&&<button className="danger-button compact" onClick={()=>void cancel(r.id)}>Отменить</button>}</td></tr>)}</tbody></table>:<Empty text="Регистраций нет"/>}</div></PageFrame>}
function StagePicker({children}:{children:(stageId:string)=>React.ReactNode}){const[stages,setStages]=useState<any[]>([]),[stageId,setStageId]=useState('');useEffect(()=>{apiGet('/stages').then(r=>{const s=listData(r);setStages(s);if(s[0]?.id)setStageId(s[0].id)})},[]);return <><div className="toolbar stage-picker"><label>Этап<select value={stageId} onChange={e=>setStageId(e.target.value)}><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name}</option>)}</select></label></div>{stageId?children(stageId):<div className="panel"><Empty text="Выберите этап"/></div>}</>}
function InspectionsPage({user}:{user:User}){
 const[stageId,setStageId]=useState(''),[stages,setStages]=useState<any[]>([]),[loadingStages,setLoadingStages]=useState(true);
 const isPastStage=(s:any)=>s?.status==='COMPLETED'||(s?.date&&new Date(s.date).getTime()<Date.now());
 const[period,setPeriod]=useState<'UPCOMING'|'PAST'>('UPCOMING');
 const visibleStages=stages.filter(s=>period==='PAST'?isPastStage(s):!isPastStage(s));
 useEffect(()=>{apiGet('/stages').then(r=>{const s=listData(r);setStages(s);const upcoming=s.filter((x:any)=>!isPastStage(x));const initial=upcoming[0]??s[0];if(initial?.id)setStageId(initial.id)}).catch(()=>{}).finally(()=>setLoadingStages(false))},[]);
 return <PageFrame title="Инспекция въезда" subtitle="Проверка зарегистрированных участников перед допуском на этап">
  <div className="toolbar stage-picker">
   <label>Период<select value={period} onChange={e=>{const next=e.target.value as 'UPCOMING'|'PAST';setPeriod(next);const nextStages=stages.filter(s=>next==='PAST'?isPastStage(s):!isPastStage(s));setStageId(nextStages[0]?.id??'')}}><option value="UPCOMING">Будущие этапы</option><option value="PAST">Прошедшие этапы</option></select></label>
   <label>Этап<select value={stageId} onChange={e=>setStageId(e.target.value)} disabled={loadingStages}><option value="">Выберите этап</option>{visibleStages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}</select></label>
  </div>
  {stageId?<EntryInspection stageId={stageId} user={user} readOnly={period==='PAST'}/>:<div className="panel"><Empty text="Выберите этап"/></div>}
 </PageFrame>
}
function EntryInspection({stageId,user,readOnly}:{stageId:string;user:User;readOnly:boolean}){
 const[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState<'ALL'|'PASSED'|'NOT_PASSED'>('ALL');
 const load=()=>{setLoading(true);setError('');return apiGet('/registrations?stageId='+encodeURIComponent(stageId)+'&status=ACTIVE').then(r=>setRows(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки регистраций')).finally(()=>setLoading(false))};
 useEffect(()=>{void load()},[stageId]);
 const passed=rows.filter(r=>r.inspection?.status==='PASSED').length,failed=rows.filter(r=>r.inspection?.status==='FAILED').length,pending=rows.filter(r=>!r.inspection).length;
 const statusFiltered=rows.filter(r=>filter==='ALL'?true:filter==='PASSED'?r.inspection?.status==='PASSED':r.inspection?.status==='FAILED');
 const filtered=statusFiltered.filter(r=>{const q=search.trim().toLowerCase();if(!q)return true;return [r.participantNumber,r.participant?.lastName,r.participant?.firstName,r.participant?.middleName,r.participant?.team,r.car?.brand,r.car?.model,r.car?.registrationNumber,r.classes?.map((x:any)=>x.class?.name).join(' ')].filter(Boolean).join(' ').toLowerCase().includes(q)});
 const passAll=async()=>{if(!pending)return;if(!window.confirm('Отметить прошедшими все ожидающие инспекции на этом этапе?'))return;setLoading(true);setError('');try{await apiPost('/inspections/stage/'+encodeURIComponent(stageId)+'/pass-pending',{});await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось массово завершить инспекции')}finally{setLoading(false)}};
 return <>
  <div className="inspection-summary">
   <button className="inspection-stat"><strong>{rows.length}</strong><span>зарегистрировано</span></button>
   <button className="inspection-stat good" onClick={()=>setFilter('PASSED')}><strong>{passed}</strong><span>прошли</span></button>
   <button className="inspection-stat bad" onClick={()=>setFilter('NOT_PASSED')}><strong>{failed}</strong><span>не прошли</span></button>
   <button className="inspection-stat pending" onClick={()=>setFilter('ALL')}><strong>{pending}</strong><span>ожидают</span></button>
  </div>
  <div className="inspection-toolbar">
   <div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по №, участнику, автомобилю, госномеру или классу"/></div>
   <select className="filter-select" value={filter} onChange={e=>setFilter(e.target.value as any)}><option value="ALL">Все</option><option value="PASSED">Прошли</option><option value="NOT_PASSED">Не прошли</option></select>
   <button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={15}/>Обновить</button>
   {!readOnly&&pending>0&&<button className="primary-button compact" onClick={()=>void passAll()}><Check size={14}/>Прошли все ({pending})</button>}
   {!readOnly&&pending>0&&<button className="danger-button compact" onClick={async()=>{const note=window.prompt('Причина для всех ожидающих инспекций:','Не прошёл общую техническую проверку перед въездом');if(!note?.trim())return;setLoading(true);try{await apiPost('/inspections/stage/'+encodeURIComponent(stageId)+'/fail-pending',{notes:note.trim()});await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось массово завершить инспекции')}finally{setLoading(false)}}}><X size={14}/>Не прошли все ({pending})</button>}
   <span className="row-count">{filtered.length} из {rows.length}</span>
  </div>
  {readOnly&&<div className="notice"><ClipboardCheck size={16}/><span>Этап завершён. Инспекции доступны только для просмотра — изменения отключены.</span></div>}
  {error&&<div className="notice"><AlertTriangle size={18}/><span>{error}</span></div>}
  <div className="panel table-wrap">
   {loading?<LoadingPage small/>:filtered.length?<table className="data-table"><thead><tr><th>№</th><th>Участник</th><th>Автомобиль</th><th>Классы</th><th>Инспекция</th><th>Действие</th></tr></thead><tbody>{filtered.map(r=><InspectionRow key={r.id} registration={r} user={user} onSaved={load} readOnly={readOnly}/>)}</tbody></table>:<Empty text={rows.length?'Поиск ничего не нашёл':'На выбранный этап нет активных регистраций'}/>}
  </div>
 </>;
}


function ResultsPage({user}:{user:User}){return <PageFrame title="Результаты" subtitle="Официальные результаты. Судья вносит, администратор может корректировать."><StagePicker>{stageId=><ResultsStage stageId={stageId} user={user}/>}</StagePicker></PageFrame>}
function ResultsStage({stageId,user}:{stageId:string;user:User}){const[data,setData]=useState<any[]>([]),[registrations,setRegistrations]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[modal,setModal]=useState<any|null>(null),[saving,setSaving]=useState(false),[classFilter,setClassFilter]=useState('ALL');const load=async()=>{setLoading(true);setError('');try{const[a,b]=await Promise.all([apiGet<any>('/results/admin/stage/'+stageId),apiGet<any>('/registrations?stageId='+encodeURIComponent(stageId)+'&status=ACTIVE')]);setData(listData(a));setRegistrations(listData(b))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки')}finally{setLoading(false)}};useEffect(()=>{void load()},[stageId]);const classes=[...new Map(registrations.flatMap((r:any)=>(r.classes??[]).map((x:any)=>[x.class?.id,x.class]))).values()].filter(Boolean);const filteredData=classFilter==='ALL'?data:data.filter(r=>r.registrationClass?.class?.id===classFilter);const save=async(v:any)=>{setSaving(true);try{if(v.id&&user.role==='ADMIN')await apiPatch('/results/'+v.id,{value:Number(v.value),place:v.place===''?null:Number(v.place),notes:v.notes||null});else await apiPost('/results',{registrationId:v.registrationId,registrationClassId:v.registrationClassId,value:Number(v.value),place:v.place===''?undefined:Number(v.place),notes:v.notes||undefined,confirmed:true});setModal(null);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить результат')}finally{setSaving(false)}};return <>{error&&<ErrorPanel message={error} retry={load}/>}<div className="toolbar"><select className="filter-select" value={classFilter} onChange={e=>setClassFilter(e.target.value)}><option value="ALL">Все классы</option>{classes.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="primary-button compact" onClick={()=>setModal({})}><Plus size={14}/>Внести результат</button><button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button><span className="row-count">{filteredData.length} из {data.length} результатов</span></div><div className="panel table-wrap">{loading?<LoadingPage small/>:data.length?<table className="data-table"><thead><tr><th>Класс</th><th>Участник</th><th>Авто</th><th>Результат</th><th>Место</th><th>Статус</th><th/></tr></thead><tbody>{filteredData.map(r=><tr key={r.id}><td data-label="Класс">{r.registrationClass?.class?.name||'—'}<small className="table-sub">{r.registrationClass?.number?.number?'№'+r.registrationClass.number.number+' · ':''}{enumLabel(r.registrationClass?.class?.unit||'')}</small></td><td data-label="Участник">{[r.registration?.participant?.lastName,r.registration?.participant?.firstName].filter(Boolean).join(' ')||'—'}<small className="table-sub">№{r.registration?.participantNumber??'—'}</small></td><td data-label="Авто">{[r.registration?.car?.brand,r.registration?.car?.model].filter(Boolean).join(' ')||'—'}</td><td data-label="Результат"><strong>{r.value}</strong></td><td data-label="Место">{r.place??'—'}</td><td data-label="Статус">{r.isHistorical?<span className="badge">Исторический</span>:<span className="badge good">Официальный</span>}</td><td data-label="Действия" className="row-actions">{user.role==='ADMIN'&&!r.isHistorical&&<button className="icon-button" title="Исправить" onClick={()=>setModal({id:r.id,value:Number(r.value),place:r.place??'',notes:r.notes??''})}>✎</button>}</td></tr>)}</tbody></table>:<Empty text="Результатов пока нет"/>}</div>{modal!==null&&<ResultModal value={modal} registrations={registrations} saving={saving} onClose={()=>setModal(null)} onSubmit={save}/>}</>}
function ResultModal({value,registrations,saving,onClose,onSubmit}:{value:any;registrations:any[];saving:boolean;onClose:()=>void;onSubmit:(v:any)=>Promise<void>}){const[v,setV]=useState<any>(value??{});const selected=registrations.find(r=>r.id===v.registrationId);const classes=selected?.classes??[];return <Modal title={v.id?'Исправление результата':'Новый результат'} onClose={onClose}><form className="form modal-form" onSubmit={e=>{e.preventDefault();void onSubmit(v)}}>{!v.id&&<><label>Регистрация<select value={v.registrationId??''} onChange={e=>setV({...v,registrationId:e.target.value,registrationClassId:''})} required><option value="">Выберите участника</option>{registrations.map(r=><option key={r.id} value={r.id}>№{r.participantNumber} · {[r.participant?.lastName,r.participant?.firstName].filter(Boolean).join(' ')} · {[r.car?.brand,r.car?.model].filter(Boolean).join(' ')}</option>)}</select></label><label>Класс регистрации<select value={v.registrationClassId??''} onChange={e=>setV({...v,registrationClassId:e.target.value})} required><option value="">Выберите класс</option>{classes.map((x:any)=><option key={x.id} value={x.id}>{x.class?.name} · {x.class?.unit}</option>)}</select></label></>}<label>Результат<input type="number" step="0.001" min="0" value={v.value??''} onChange={e=>setV({...v,value:e.target.value})} required/></label><label>Место<input type="number" min="1" max="999" value={v.place??''} onChange={e=>setV({...v,place:e.target.value})}/></label><label>Комментарий<textarea rows={4} value={v.notes??''} onChange={e=>setV({...v,notes:e.target.value})}/></label><button className="primary-button" disabled={saving||(!v.id&&(!v.registrationId||!v.registrationClassId))}>{saving?'Сохраняем…':'Сохранить результат'}</button></form></Modal>}

function DisqualificationsPage(){
 const[data,setData]=useState<any[]>([]),[participants,setParticipants]=useState<any[]>([]),[stages,setStages]=useState<any[]>([]),[seasons,setSeasons]=useState<any[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[modal,setModal]=useState(false),[status,setStatus]=useState<'ACTIVE'|'REVOKED'|'ALL'>('ACTIVE');
 const load=async()=>{setLoading(true);setError('');try{const q=status==='ALL'?'':'?status='+status;const [d,p,st,se]=await Promise.all([apiGet<any>('/disqualifications'+q),apiGet<any>('/participants'),apiGet<any>('/stages'),apiGet<any>('/seasons')]);setData(listData(d));setParticipants(listData(p));setStages(listData(st));setSeasons(listData(se))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки дисквалификаций')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[status]);
 const create=async(v:any)=>{setSaving(true);try{await apiPost('/disqualifications',{participantId:v.participantId,scope:v.scope,stageId:v.scope==='STAGE'?v.stageId:undefined,seasonId:v.scope==='SEASON'?v.seasonId:undefined,reason:v.reason});setModal(false);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось выдать дисквалификацию')}finally{setSaving(false)}};
 const revoke=async(d:any)=>{const reason=window.prompt('Причина отзыва дисквалификации:');if(!reason?.trim())return;setSaving(true);try{await apiPatch('/disqualifications/'+d.id+'/revoke',{revokeReason:reason.trim()});await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось отозвать дисквалификацию')}finally{setSaving(false)}};
 return <PageFrame title="Дисквалификации" subtitle="Реальное управление запретами: выдача, просмотр и отзыв с обязательной причиной." action={<div className="page-actions"><button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button><button className="primary-button compact" onClick={()=>setModal(true)}><Plus size={15}/>Выдать дисквалификацию</button></div>}>
  <div className="toolbar"><select className="filter-select" value={status} onChange={e=>setStatus(e.target.value as any)}><option value="ACTIVE">Действующие</option><option value="REVOKED">Отозванные</option><option value="ALL">Все</option></select><span className="row-count">{data.length} записей</span></div>
  {error&&<ErrorPanel message={error} retry={load}/>}
  <div className="panel table-wrap disqualification-table-wrap">{loading?<LoadingPage small/>:data.length?<table className="data-table disqualification-table"><thead><tr><th>Участник</th><th>Область</th><th>Этап / сезон</th><th>Статус</th><th>Причина</th><th>Кем выдана</th><th>Действия</th></tr></thead><tbody>{data.map(d=><tr key={d.id}><td data-label="Участник"><strong>{[d.participant?.lastName,d.participant?.firstName,d.participant?.middleName].filter(Boolean).join(' ')||'—'}</strong>{d.participant?.team&&<small className="table-sub">{d.participant.team}</small>}</td><td data-label="Область"><span className="badge">{d.scope==='STAGE'?'Этап':d.scope==='SEASON'?'Сезон':'Весь формат'}</span></td><td data-label="Этап / сезон">{d.scope==='STAGE'?<><strong>№{d.stage?.stageNumber??'—'} · {d.stage?.name??'Этап'}</strong>{d.stage?.city&&<small className="table-sub">{d.stage.city}</small>}</>:d.scope==='SEASON'?<><strong>{d.season?.name??'Сезон'}</strong>{d.season?.year&&<small className="table-sub">{d.season.year}</small>}</>:<strong>Весь формат</strong>}</td><td data-label="Статус"><span className={'badge '+(d.status==='ACTIVE'?'bad':'good')}>{d.status==='ACTIVE'?'Действует':'Отозвана'}</span></td><td data-label="Причина" className="disqualification-reason" title={d.reason}>{d.reason||'—'}</td><td data-label="Кем выдана">{d.issuedByUser?.name||'—'}{d.issuedByUser?.role&&<small className="table-sub">{roleName[d.issuedByUser.role as Role]??enumLabel(d.issuedByUser.role)}</small>}</td><td data-label="Действия" className="row-actions">{d.status==='ACTIVE'&&<button className="danger-button compact" disabled={saving} onClick={()=>void revoke(d)}><X size={14}/>Отозвать</button>}{d.status==='REVOKED'&&<span className="muted">Отозвана</span>}</td></tr>)}</tbody></table>:<Empty text="Дисквалификаций по выбранному фильтру нет"/>}</div>
  {modal&&<DisqualificationModal participants={participants} stages={stages} seasons={seasons} saving={saving} onClose={()=>setModal(false)} onSubmit={create}/>}
 </PageFrame>
}
function DisqualificationModal({participants,stages,seasons,saving,onClose,onSubmit}:{participants:any[];stages:any[];seasons:any[];saving:boolean;onClose:()=>void;onSubmit:(v:any)=>Promise<void>}){
 const[v,setV]=useState<any>({scope:'STAGE',participantId:'',stageId:'',seasonId:'',reason:''});
 return <Modal title="Новая дисквалификация" onClose={onClose}><form className="form modal-form" onSubmit={e=>{e.preventDefault();void onSubmit(v)}}>
  <label>Участник<select value={v.participantId} onChange={e=>setV({...v,participantId:e.target.value})} required><option value="">Выберите участника</option>{participants.map(p=><option key={p.id} value={p.id}>{[p.lastName,p.firstName,p.middleName].filter(Boolean).join(' ')}{p.team?' · '+p.team:''}</option>)}</select></label>
  <label>Область<select value={v.scope} onChange={e=>setV({...v,scope:e.target.value,stageId:'',seasonId:''})}><option value="STAGE">Этап</option><option value="SEASON">Сезон</option><option value="FORMAT">Весь формат</option></select></label>
  {v.scope==='STAGE'&&<label>Этап<select value={v.stageId} onChange={e=>setV({...v,stageId:e.target.value})} required><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>№{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}</select></label>}
  {v.scope==='SEASON'&&<label>Сезон<select value={v.seasonId} onChange={e=>setV({...v,seasonId:e.target.value})} required><option value="">Выберите сезон</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.year} · {s.name}</option>)}</select></label>}
  <label>Причина<textarea rows={4} value={v.reason} onChange={e=>setV({...v,reason:e.target.value})} placeholder="Укажите причину дисквалификации" required/></label>
  <button className="primary-button" disabled={saving}>{saving?'Сохраняем…':'Выдать дисквалификацию'}</button>
 </form></Modal>
}

function HistoricalPage(){
 const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=()=>{setLoading(true);setError('');return apiGet<any>('/historical-results').then(r=>setData(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки исторических результатов')).finally(()=>setLoading(false))};
 const verify=async(id:string)=>{try{await apiPost('/historical-results/'+id+'/verify',{});await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось подтвердить результат')}};
 const verifyAll=async()=>{if(!window.confirm('Подтвердить все исторические результаты, которые сейчас ожидают проверки?'))return;setLoading(true);setError('');try{const r=await apiPost<any>('/historical-results/verify-all',{});await load();if(r?.remaining)window.alert('Не удалось подтвердить часть записей: '+r.remaining)}catch(e){setError(e instanceof Error?e.message:'Не удалось подтвердить все результаты')}finally{setLoading(false)}};
 const pending=data.filter(r=>r.verificationStatus==='PENDING').length;
 return <PageFrame title="История результатов" subtitle="Архивные результаты: импортируются на проверку и подтверждаются администратором." action={<div className="page-actions"><button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>{pending>0&&<button className="primary-button compact" onClick={()=>void verifyAll()}><CheckCircle2 size={14}/>Подтвердить все ({pending})</button>}</div>}>
  {error&&<ErrorPanel message={error} retry={load}/>}<div className="panel table-wrap">{loading?<LoadingPage small/>:data.length?<table className="data-table"><thead><tr><th>Класс</th><th>Участник</th><th>Этап</th><th>Результат</th><th>Место</th><th>Проверка</th><th/></tr></thead><tbody>{data.map(r=><tr key={r.id}><td data-label="Класс">{r.registrationClass?.class?.name||'—'}</td><td data-label="Участник">{[r.registration?.participant?.lastName,r.registration?.participant?.firstName].filter(Boolean).join(' ')||'—'}<small className="table-sub">№{r.registration?.participantNumber??'—'}</small></td><td data-label="Этап">{r.registration?.stage?<><strong>№{r.registration.stage.stageNumber} · {r.registration.stage.name}</strong><small className="table-sub">{r.registration.stage.season?.year??''}</small></>:'—'}</td><td data-label="Результат"><strong>{r.value}</strong> {enumLabel(r.unit)}</td><td data-label="Место">{r.place??'—'}</td><td data-label="Проверка"><span className={'badge '+(r.verificationStatus==='VERIFIED'?'good':'')}>{r.verificationStatus==='VERIFIED'?'Подтверждён':'Ожидает проверки'}</span></td><td data-label="Действия" className="row-actions">{r.verificationStatus==='PENDING'&&<button className="primary-button compact" onClick={()=>void verify(r.id)}>Подтвердить</button>}</td></tr>)}</tbody></table>:<Empty text="Исторических результатов нет"/>}</div></PageFrame>
}
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
 const changeMode=(next:'NORMAL'|'HISTORICAL')=>{setMode(next);setResult(null);setJob(null);setRows([]);setResolveRow(null);setResolution('{}');setError('')};
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
 return <PageFrame title="Импорт" showHelp={false} subtitle="Импорт из Google Таблиц: сначала проверка, затем исправление предупреждений и только после этого запись в чемпионат." action={job?.id?<button className="secondary-button compact" onClick={()=>void refreshJob(job.id)}><RefreshCw size={14}/>Обновить импорт</button>:undefined}>
  <div className="import-steps"><div className="import-step active"><b>1</b><span>Источник и этап</span></div><div className="import-step"><b>2</b><span>Проверка</span></div><div className="import-step"><b>3</b><span>Исправление</span></div><div className="import-step"><b>4</b><span>Завершение импорта</span></div></div>
  <div className="notice"><FileInput size={17}/><div><strong>Исторический импорт:</strong> источником истины является только <b>Результаты</b>. Лист <b>Регистрация</b> используется только как справочник. Строки из «Регистрация» не попадают в очередь исправлений и сами по себе ничего не создают.</div></div>
  <div className="import-grid">
   <div className="panel form">
    <div className="segmented"><button className={mode==='NORMAL'?'selected':''} onClick={()=>changeMode('NORMAL')}>Обычный импорт</button><button className={mode==='HISTORICAL'?'selected':''} onClick={()=>changeMode('HISTORICAL')}>Исторический</button></div>
    {!google?.connected?<div className="notice"><AlertTriangle size={16}/><span>Google аккаунт ещё не подключён.</span><button className="primary-button compact" onClick={()=>void connectGoogle()}>Подключить Google</button></div>:<div className="notice"><Check size={16}/><span>Подключён: <strong>{google.email}</strong></span></div>}
    <label>Этап<select value={stageId} onChange={e=>setStageId(e.target.value)}><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}</select></label>
    <label>Google Таблица<select value={spreadsheetId} onChange={e=>setSpreadsheetId(e.target.value)} disabled={!google?.connected}><option value="">Выберите таблицу</option>{spreadsheets.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    {spreadsheet&&<div className="import-example"><b>{spreadsheet.title}</b><br/>Регистрация: {registrationSheet?'найден':'не найден'}<br/>Результаты: {resultSheet?'найден':'не найден'}</div>}
    <button className="primary-button" disabled={loading||!stageId||!spreadsheetId||!google?.connected} onClick={()=>void preview()}>{loading?'Загружаем и проверяем…':'1. Загрузить и запустить Preview'}</button>
    {error&&<div className="form-error"><AlertTriangle size={16}/>{error}</div>}
   </div>
   <div className="panel"><PanelTitle title="Результат проверки" icon={FileInput}/>
    {job?<><div className="import-summary"><div><b>{readyCount}</b><span>готово</span></div><div className="warning"><b>{warnCount}</b><span>нужно исправить</span></div><div className="resolved"><b>{resolvedCount}</b><span>исправлено</span></div>{mode==='HISTORICAL'?<><div className="good"><b>{visibleRows.filter((r:any)=>r.normalizedData?.participantNumberSource==='REGISTRATION').length}</b><span>номер из регистрации</span></div><div><b>{visibleRows.filter((r:any)=>r.normalizedData?.participantNumberSource==='RESULT'||r.normalizedData?.participantNumberSource==='BOTH').length}</b><span>номер из результатов</span></div><div className="warning"><b>{visibleRows.filter((r:any)=>r.normalizedData?.participantNumberSource==='NONE'&&r.status==='READY').length}</b><span>номер авто</span></div></>:<div><b>{visibleRows.length}</b><span>строк в работе</span></div>}</div>
      <div className="import-job-line">Состояние импорта: <strong>{enumLabel(job.status)}</strong></div>
      <div className="import-rows">{visibleRows.slice(0,100).map((r:any,i:number)=><div className="import-row" key={r.id??i}><span className={`import-row-status ${String(r.status).toLowerCase()}`}>{enumLabel(r.status)}</span><span className="import-row-main"><b>{r.type==='REGISTRATION'?'Регистрация':'Результат'} · строка {r.rowNumber}</b><small>{Array.isArray(r.warnings)?r.warnings.join(' · '):typeof r.warnings==='object'?JSON.stringify(r.warnings):r.warnings||'Ошибок нет'}</small>{mode==='HISTORICAL'&&r.type==='RESULT'&&<small className="table-sub">{r.normalizedData?.participantNumberSource==='REGISTRATION'?'Номер взят из «Регистрация»':r.normalizedData?.participantNumberSource==='RESULT'?'Номер взят из «Результаты»':r.normalizedData?.participantNumberSource==='BOTH'?'Номер совпал в обоих листах':r.normalizedData?.participantNumberSource==='AUTO'?'Номер выдан автоматически':'Номер будет определён при commit'}{r.normalizedData?.car?.model||r.normalizedData?.car?.plateNumber?' · Авто из справочника':''}</small>}</span>{r.status==='WARNING'&&(mode!=='HISTORICAL'||r.type==='RESULT')&&<button className="secondary-button compact" onClick={()=>{setResolveRow(r);setResolution(r.resolution?JSON.stringify(r.resolution,null,2):JSON.stringify({},null,2))}}>Исправить</button>}</div>)}</div>
      {blockingWarnCount===0&&job.status==='DRAFT'&&<button className="primary-button" disabled={loading} onClick={()=>void commit()}>4. Подтвердить и записать импорт</button>}
      {blockingWarnCount>0&&<div className="notice"><AlertTriangle size={16}/><span>{mode==='HISTORICAL'?'Исправьте предупреждения в строках результатов. Лист «Регистрация» используется только как справочник и сам по себе ничего не создаёт.':'Есть предупреждения. Пока остаётся хотя бы один WARNING — запись заблокирована.'}</span></div>}
      {job.status==='COMMITTED'&&<div className="notice"><Check size={17}/><span>Импорт успешно записан в базу USD.</span></div>}
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

   <details className="resolution-json-preview"><summary>Показать сформированное решение</summary><pre className="json-view">{JSON.stringify(parsed,null,2)}</pre></details>
   <div className="resolution-footer"><button className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" disabled={loading||loadingOptions} onClick={()=>void onSave()}>{loading?<><Loader2 className="spin" size={15}/>Сохраняем…</>:<><Check size={15}/>Сохранить решение</>}</button></div>
  </div>
 </Modal>
}

function RecordsPage(){
 const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=()=>{setLoading(true);setError('');return apiGet<any>('/records/admin/current').then(r=>setData(listData(r).filter((x:any)=>!String(x.class?.name??'').trim().toLowerCase().startsWith('bassrace')))).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки рекордов')).finally(()=>setLoading(false))};
 useEffect(()=>{void load()},[]);
 return <PageFrame title="Рекорды" subtitle="Текущие действующие рекорды чемпионата" action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
  {error&&<ErrorPanel message={error} retry={load}/>}
  <div className="panel table-wrap">{loading?<LoadingPage small/>:data.length?<table className="data-table"><thead><tr><th>Класс</th><th>Участник</th><th>Автомобиль</th><th>Результат</th><th>Ед.</th><th>Этап</th><th>Дата</th></tr></thead><tbody>{data.map((r:any)=>{const p=r.result?.registration?.participant;const car=r.result?.registration?.car;const st=r.stage;const cls=r.class;return <tr key={r.id}>
   <td data-label="Класс"><strong>{cls?.name??'—'}</strong>{cls?.direction?.name&&<small className="table-sub">{cls.direction.name}</small>}</td>
   <td data-label="Участник"><strong>{[p?.lastName,p?.firstName,p?.middleName].filter(Boolean).join(' ')||'—'}</strong>{p?.team&&<small className="table-sub">{p.team}</small>}</td>
   <td data-label="Автомобиль">{[car?.brand,car?.model].filter(Boolean).join(' ')||'—'}</td>
   <td data-label="Результат"><strong>{r.value??r.result?.value??'—'}</strong></td>
   <td data-label="Ед.">{r.unit??r.result?.unit??'—'}</td>
   <td data-label="Этап">{st?<><strong>№{st.stageNumber} · {st.name}</strong>{st.city&&<small className="table-sub">{st.city}</small>}</>:'—'}</td>
   <td data-label="Дата">{formatDate(r.achievedAt)}</td>
  </tr>})}</tbody></table>:<Empty text="Рекордов пока нет"/>}</div>
 </PageFrame>
}
function StatisticsPage(){
 const[overview,setOverview]=useState<any>(null),[participants,setParticipants]=useState<any[]>([]),[selected,setSelected]=useState<any|null>(null),[seasons,setSeasons]=useState<any[]>([]),[seasonId,setSeasonId]=useState(''),[analytics,setAnalytics]=useState<any|null>(null),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[error,setError]=useState('');
 const loadOverview=async()=>{setLoading(true);setError('');try{const[o,se]=await Promise.all([apiGet<any>('/statistics/overview'),apiGet<any>('/seasons')]);setOverview(o?.stats??o);const ss=listData(se);setSeasons(ss);const active=ss.find((x:any)=>x.status==='ACTIVE')??ss[0];if(active?.id)setSeasonId(active.id)}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки статистики')}finally{setLoading(false)}};
 const searchParticipants=async()=>{if(!search.trim()){setParticipants([]);return}try{const r=await apiGet<any>('/statistics/participants?search='+encodeURIComponent(search.trim())+'&limit=20');setParticipants(listData(r))}catch(e){setError(e instanceof Error?e.message:'Ошибка поиска участника')}};
 const openParticipant=async(id:string)=>{setDetailLoading(true);setError('');try{setSelected(await apiGet<any>('/statistics/participants/'+encodeURIComponent(id)));setParticipants([])}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки статистики участника')}finally{setDetailLoading(false)}};
 const loadSeason=async(id:string)=>{setSeasonId(id);setAnalytics(null);if(!id)return;try{setAnalytics(await apiGet<any>('/statistics/seasons/'+encodeURIComponent(id)+'/analytics'))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки статистики сезона')}};
 useEffect(()=>{void loadOverview()},[]);
 useEffect(()=>{if(seasonId)void loadSeason(seasonId)},[seasonId]);
 const s=overview??{},ps=selected?.stats??{};
 return <PageFrame title="Статистика" subtitle="Спортивная статистика для участников, команд и спонсорских отчётов" action={<button className="secondary-button compact" onClick={()=>void loadOverview()}><RefreshCw size={14}/>Обновить</button>}>
  {error&&<ErrorPanel message={error} retry={loadOverview}/>}
  <div className="kpi-grid small">{[['participants','Участники','Профили'],['cars','Автомобили','Активные автомобили'],['seasons','Сезоны','Активные сезоны'],['stages','Этапы','Этапы чемпионата'],['activeRegistrations','Регистрации','Активные регистрации'],['appearances','Выступления','Учтённые результаты'],['currentRecords','Рекорды','Действующие рекорды']].map(([key,label,hint])=><div className="stat-card" key={key}><span>{label}</span><strong>{loading?'—':String(s[key]??0)}</strong><small>{hint}</small></div>)}</div>
  <section className="panel statistics-participant-search"><PanelTitle title="Статистика участника" icon={UserRound}/><div className="toolbar"><div className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void searchParticipants()}} placeholder="Начните вводить ФИО или команду"/></div><button className="primary-button compact" onClick={()=>void searchParticipants()}>Найти</button></div>
   {participants.length>0&&<div className="statistics-search-results">{participants.map((p:any)=>{const x=p.participant??p;return <button className="statistics-search-result" key={x.id} onClick={()=>void openParticipant(x.id)}><strong>{[x.lastName,x.firstName,x.middleName].filter(Boolean).join(' ')}</strong><span>{[x.team,x.city].filter(Boolean).join(' · ')||'Без команды'}</span></button>})}</div>}
   {detailLoading&&<LoadingPage small/>}{selected&&!detailLoading&&<div className="participant-stat-card"><div className="participant-stat-head"><div><span className="eyebrow">Участник</span><h3>{[selected.participant?.lastName,selected.participant?.firstName,selected.participant?.middleName].filter(Boolean).join(' ')}</h3><p>{[selected.participant?.team,selected.participant?.city].filter(Boolean).join(' · ')||'Без команды'}</p></div><button className="secondary-button compact" onClick={()=>setSelected(null)}>Сбросить</button></div><div className="admin-mini-stats"><div><span>Регистрации</span><strong>{ps.registrations??0}</strong></div><div><span>Этапы</span><strong>{ps.attendedStages??0}</strong></div><div><span>Результаты</span><strong>{ps.resultCount??0}</strong></div><div><span>Победы</span><strong>{ps.firstPlaces??0}</strong></div><div><span>Подиумы</span><strong>{ps.podiums??0}</strong></div><div><span>Автомобили</span><strong>{ps.cars??0}</strong></div><div><span>Рекорды</span><strong>{ps.records??0}</strong></div></div></div>}
  </section>
  <section className="panel"><div className="statistics-section-head"><div><PanelTitle title="Статистика сезона и спонсорская аналитика" icon={BarChart3}/><span className="muted">Регистрации, команды, виброизоляция и бренды конфигураций</span></div><select className="filter-select" value={seasonId} onChange={e=>void loadSeason(e.target.value)}><option value="">Выберите сезон</option>{seasons.map((x:any)=><option key={x.id} value={x.id}>{x.year}{x.name?' · '+x.name:''}</option>)}</select></div>
   {!analytics?<Empty text="Выберите сезон"/>:<><div className="admin-mini-stats"><div><span>Регистрации</span><strong>{analytics.registrations.total}</strong></div><div><span>С командами</span><strong>{analytics.registrations.withTeam}</strong></div><div><span>Без команды</span><strong>{analytics.registrations.withoutTeam} · {analytics.registrations.withoutTeamPercent}%</strong></div></div><div className="statistics-analytics-grid"><div><h3>Команды</h3><div className="statistics-bars">{analytics.teams.map((x:any)=><div className="statistics-bar-row" key={x.name}><div><strong>{x.name}</strong><span>{x.registrations} рег. · {x.percent}% · {x.participants} уч.</span></div><div className="statistics-bar-track"><i style={{width:Math.min(100,x.percent)+'%'}}/></div></div>)}</div></div><div><h3>Виброизоляция</h3><div className="statistics-bars">{analytics.vibrationIsolation.length?analytics.vibrationIsolation.map((x:any)=><div className="statistics-bar-row" key={x.name}><div><strong>{x.name}</strong><span>{x.count} · {x.percent}%</span></div><div className="statistics-bar-track"><i style={{width:Math.min(100,x.percent)+'%'}}/></div></div>):<Empty text="Данные о виброизоляции не заполнены"/>}</div></div></div><div className="statistics-brand-block"><h3>Бренды конфигураций</h3><div className="statistics-brand-grid">{analytics.configurationBrands.length?analytics.configurationBrands.map((x:any)=><div className="stat-card" key={x.brand}><span>{x.brand}</span><strong>{x.count}</strong><small>{x.percent}% регистраций с брендом</small></div>):<Empty text="Бренды конфигураций пока не заполнены"/>}</div></div></>}
  </section>
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
  <div className="toolbar"><div className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void load()}} placeholder="Email"/></div><select className="filter-select" value={role} onChange={e=>setRoleFilter(e.target.value)}><option value="">Все роли</option><option value="ADMIN">Администратор</option><option value="JUDGE">Судья</option><option value="PARTICIPANT">Участник</option></select><button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/></button><span className="row-count">{data.length} пользователей</span></div>
  {error&&<ErrorPanel message={error} retry={load}/>}<div className="panel table-wrap">{loading?<LoadingPage small/>:<table className="data-table"><thead><tr><th>Email</th><th>Роль</th><th>Статус</th><th>Подтверждение</th><th>Создан</th><th/></tr></thead><tbody>{data.map(u=><tr key={u.id}><td data-label="Email">{u.email}</td><td data-label="Роль"><select className="inline-select" value={u.role} onChange={e=>void changeRole(u,e.target.value)}><option value="ADMIN">Администратор</option><option value="JUDGE">Судья</option><option value="PARTICIPANT">Участник</option></select></td><td data-label="Статус"><span className={`badge ${u.isActive?'good':''}`}>{u.isActive?'Активен':'Отключён'}</span></td><td data-label="Подтверждение">{u.emailVerifiedAt?'Да':'Нет'}</td><td data-label="Создан">{formatDate(u.createdAt)}</td><td data-label="Действия" className="row-actions"><button className="secondary-button compact" onClick={()=>void setActive(u)}>{u.isActive?'Отключить':'Включить'}</button></td></tr>)}</tbody></table>}</div>
  {modal!==null&&<Modal title="Новый пользователь" onClose={()=>setModal(null)}><EntityForm fields={[{name:'email',label:'Email',type:'email',required:true},{name:'password',label:'Пароль',type:'password',required:true},{name:'role',label:'Роль',options:['ADMIN','JUDGE','PARTICIPANT'],required:true}]} initial={modal} saving={saving} onSubmit={save}/></Modal>}
 </PageFrame>
}
function AuditPage(){
 const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const[entity,setEntity]=useState(''),[action,setAction]=useState('');
 const load=async()=>{setLoading(true);setError('');try{const r=await getAudit(1,100,entity,action);setData(listData(r))}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить аудит')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[entity,action]);
 const actions=[...new Set(data.map(x=>x.action).filter(Boolean))];
 return <PageFrame title="Аудит" subtitle="Понятная история: кто, что, где и когда изменил в системе." action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
  <div className="audit-toolbar panel">
   <label>Раздел<select value={entity} onChange={e=>setEntity(e.target.value)}><option value="">Все разделы</option>{['User','Participant','Car','CarConfiguration','Season','Stage','StageClass','Direction','Class','Registration','RegistrationClass','RegistrationNumber','Inspection','Result','Record','Disqualification','ImportJob','ImportRow','MediaUpload','AssistantRequest','SiteSettings'].map(x=><option key={x} value={x}>{auditEntityName(x)}</option>)}</select></label>
   <label>Действие<select value={action} onChange={e=>setAction(e.target.value)}><option value="">Все действия</option>{actions.map(x=><option key={x} value={x}>{auditActionName(x)}</option>)}</select></label>
   <div className="audit-count"><strong>{data.length}</strong><span>событий показано</span></div>
  </div>
  {error&&<ErrorPanel message={error} retry={load}/>}
  {loading?<LoadingPage/>:<div className="audit-list">{data.map((x:any)=><AuditEntryCard key={x.id} item={x}/>)}</div>}
  {!loading&&!data.length&&<div className="panel"><Empty text="По выбранным фильтрам событий нет"/></div>}
 </PageFrame>
}
function AuditEntryCard({item}:{item:any}){
 const meta=item.metadata&&typeof item.metadata==='object'?item.metadata:{};
 const actor=item.user?.name||item.user?.email||'Система';
 const details=Object.entries(meta).filter(([k,v])=>v!==null&&v!==undefined&&k!=='password'&&!/id$/i.test(k)&&!/Ids$/i.test(k)).slice(0,8);
 return <article className="audit-entry">
  <div className="audit-entry-icon"><FileClock size={17}/></div>
  <div className="audit-entry-main">
   <div className="audit-entry-head"><strong>{auditActionName(item.action)}</strong><time>{new Date(item.createdAt).toLocaleString('ru-RU')}</time></div>
   <div className="audit-entry-sub"><span className="badge">{actor}</span><span>{roleName[item.user?.role as Role]??'Система'}</span><span>·</span><span>{auditEntityName(item.entity)}</span></div>
   {details.length>0&&<div className="audit-details">{details.map(([k,v])=><div key={k}><span>{humanizeAuditKey(k)}</span><strong>{formatAuditValue(v)}</strong></div>)}</div>}
   {item.ipAddress&&<small className="audit-ip">IP: {item.ipAddress}</small>}
  </div>
 </article>
}
function auditEntityName(x:string){const m:Record<string,string>={Stage:'Этап',Registration:'Регистрация',Participant:'Участник',Car:'Автомобиль',Result:'Результат',Inspection:'Инспекция',ImportJob:'Импорт',AssistantRequest:'Запрос ассистента',SiteSettings:'Настройки сайта',User:'Пользователь',Disqualification:'Дисквалификация',Season:'Сезон',Class:'Класс',Direction:'Направление',Record:'Рекорд'};return m[x]??humanize(x)}
function auditActionName(x:string){const m:Record<string,string>={
 CREATE:'Создание',UPDATE:'Изменение',DELETE:'Удаление',LOGIN:'Вход',LOGOUT:'Выход',HISTORICAL_RESULT_CREATED:'Добавлен исторический результат',HISTORICAL_RESULT_VERIFIED:'Исторический результат подтверждён',HISTORICAL_RESULT_CORRECTED:'Исторический результат исправлен',INSPECTION_DELETED:'Инспекция удалена',ASSISTANT_AI_USED:'Ассистент ИИ использован',
 IMPORT_PREVIEW:'Предпросмотр импорта',IMPORT_COMMITTED:'Импорт зафиксирован',IMPORT_ROW_RESOLVED:'Строка импорта исправлена',
 INSPECTION_CREATED:'Инспекция создана',INSPECTION_UPDATED:'Инспекция изменена',RESULT_CREATED:'Результат внесён',RESULT_UPDATED:'Результат изменён',RESULT_DELETED:'Результат удалён',
 DISQUALIFICATION_CREATED:'Дисквалификация создана',DISQUALIFICATION_REVOKED:'Дисквалификация отозвана',
 ASSISTANT_CHAT_USED:'Использован чат ассистента',ASSISTANT_FUNCTION_EXECUTED:'Выполнена функция ассистента',ASSISTANT_REQUEST_CREATED:'Создан запрос ассистента',ASSISTANT_REQUEST_SUBMITTED:'Запрос отправлен на подтверждение',ASSISTANT_REQUEST_APPROVED:'Запрос подтверждён',ASSISTANT_REQUEST_REJECTED:'Запрос отклонён',ASSISTANT_REQUEST_APPLIED:'Запрос применён',
 SITE_SETTINGS_UPDATED:'Настройки сайта изменены',USER_CREATED:'Пользователь создан',USER_UPDATED:'Пользователь изменён'
 };if(m[x])return m[x];const words:Record<string,string>={CREATE:'Создание',UPDATE:'Изменение',DELETE:'Удаление',LOGIN:'Вход',LOGOUT:'Выход',CREATED:'Создано',UPDATED:'Изменено',DELETED:'Удалено',VERIFIED:'Подтверждено',CORRECTED:'Исправлено',REVOKED:'Отозвано',COMMITTED:'Зафиксировано',RESOLVED:'Исправлено',USED:'Использован',EXECUTED:'Выполнено',SUBMITTED:'Отправлено',APPROVED:'Подтверждено',REJECTED:'Отклонено',APPLIED:'Применено',HISTORICAL:'Исторический',RESULT:'результат',INSPECTION:'инспекция',DISQUALIFICATION:'дисквалификация',REGISTRATION:'регистрация',IMPORT:'импорт',USER:'пользователь',CAR:'автомобиль',PARTICIPANT:'участник',STAGE:'этап',SEASON:'сезон',CLASS:'класс',ASSISTANT:'ассистент',FUNCTION:'функция',CHAT:'чат',SITE:'сайт',SETTINGS:'настройки',PREVIEW:'предпросмотр',ROW:'строка',DATA:'данные',QUALITY:'качество'};return x.split('_').map(w=>words[w]??w.toLowerCase()).join(' ')}
function humanizeAuditKey(x:string){const m:Record<string,string>={stageId:'Этап',rowsCount:'Количество строк',historicalResults:'Исторический импорт',type:'Тип',title:'Название',functionCode:'Функция',scope:'Область',reason:'Причина',confirmation:'Подтверждение',status:'Статус',risk:'Риск',entity:'Раздел',before:'До изменения',after:'После изменения',sections:'Изменённые разделы',model:'Модель ассистента'};return m[x]??humanize(x)}
function formatAuditValue(v:any){if(typeof v==='boolean')return v?'Да':'Нет';if(typeof v==='string')return enumLabel(v);if(typeof v==='object')return JSON.stringify(v);return String(v)}
function QualityPage(){
 const[data,setData]=useState<any>(null),[error,setError]=useState(''),[showHidden,setShowHidden]=useState(false),[hidden,setHidden]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('usd.quality.hidden')||'[]')}catch{return[];}});
 const load=()=>getDataQuality().then(setData).catch(e=>setError(e instanceof Error?e.message:'Не удалось проверить данные'));
 useEffect(()=>{void load()},[]);
 const issues=data?.issues??[], issueKey=(x:any,i:number)=>[x.code,x.entity,x.entityId,x.message,i].filter(Boolean).join('|');
 const hide=(key:string)=>{const next=[...new Set([...hidden,key])];setHidden(next);localStorage.setItem('usd.quality.hidden',JSON.stringify(next))};
 const restore=(key:string)=>{const next=hidden.filter(x=>x!==key);setHidden(next);localStorage.setItem('usd.quality.hidden',JSON.stringify(next))};
 const visible=issues.filter((x:any,i:number)=>showHidden||!hidden.includes(issueKey(x,i)));
 const entityName=(x:string)=>({Registration:'Регистрация',Inspection:'Инспекция',Result:'Результат',Record:'Рекорд',Car:'Автомобиль',ImportJob:'Импорт'} as Record<string,string>)[x]??humanize(x);
 const severity=(x:string)=>x==='ERROR'?'Ошибка':x==='WARNING'?'Предупреждение':'Информация';
 const qualityRuleName=(x:string)=>({REGISTRATION_WITHOUT_INSPECTION:'Активная регистрация без инспекции',REGISTRATION_WITHOUT_CLASSES:'Активная регистрация без класса',FAILED_INSPECTION_WITH_RESULT:'Результат при непройденной инспекции',RESULT_FOR_CANCELLED_REGISTRATION:'Результат отменённой регистрации',RESULT_FOR_FAILED_INSPECTION:'Результат при непройденной инспекции',HISTORICAL_RESULT_PENDING:'Исторический результат ожидает подтверждения',RESULT_UNIT_MISMATCH:'Несовпадение единиц результата и класса',ORPHAN_RECORD:'Рекорд без результата',RECORD_UNIT_MISMATCH:'Несовпадение единиц рекорда и класса',CAR_WITHOUT_CONFIGURATION:'Автомобиль без конфигурации',IMPORT_WITH_UNRESOLVED_WARNINGS:'Импорт с нерешёнными предупреждениями'} as Record<string,string>)[x]??humanize(x);
 return <PageFrame title="Контроль данных" subtitle="Проверка целостности: найденные проблемы можно скрывать без удаления из базы." action={<div className="settings-save-actions"><button className="secondary-button compact" onClick={()=>setShowHidden(v=>!v)}>{showHidden?'Скрыть отмеченные':'Показать скрытые'}</button><button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Проверить снова</button></div>}>
  {error&&<ErrorPanel message={error} retry={load}/>}<div className="quality-summary">{data&&<><div className="stat-card"><span>Всего проблем</span><strong>{issues.length}</strong></div><div className="stat-card danger-card"><span>Ошибки</span><strong>{issues.filter((x:any)=>x.severity==='ERROR').length}</strong></div><div className="stat-card"><span>Предупреждения</span><strong>{issues.filter((x:any)=>x.severity==='WARNING').length}</strong></div><div className="stat-card"><span>Показано</span><strong>{visible.length}</strong></div></>}</div>
  <div className="panel quality-table-panel">{!visible.length?<Empty text={data?'Активных проблем нет':'Загрузка проверки…'}/>:<div className="smart-table-wrap"><table className="data-table"><thead><tr><th>Уровень</th><th>Что найдено</th><th>Раздел</th><th>Подробности</th><th/></tr></thead><tbody>{visible.map((x:any,i:number)=>{const key=issueKey(x,i);const isHidden=hidden.includes(key);return <tr key={key}><td data-label="Уровень"><span className={'badge '+(x.severity==='ERROR'?'bad':x.severity==='WARNING'?'warn':'')}>{severity(x.severity)}</span></td><td data-label="Что найдено"><strong>{x.message}</strong><small className="table-sub">Правило: {qualityRuleName(x.code)}</small></td><td data-label="Раздел">{entityName(x.entity)}</td><td data-label="Подробности">{x.context?Object.entries(x.context).filter(([k])=>!k.toLowerCase().endsWith('id')&&!k.toLowerCase().endsWith('ids')).map(([k,v])=><span className="quality-detail" key={k}><b>{humanizeAuditKey(k)}</b>: {enumLabel(v as any)}</span>):'—'}</td><td data-label="Действие" className="row-actions">{isHidden?<button className="secondary-button compact" onClick={()=>restore(key)}>Показать</button>:<button className="secondary-button compact" onClick={()=>hide(key)}>Скрыть</button>}</td></tr>})}</tbody></table></div>}</div>
 </PageFrame>
}
function ResourcePlaceholder({title,icon:Icon}:{title:string;icon:any}){return <Coming title={title} icon={Icon} user={{role:'ADMIN'} as User}/>}

function PartnersPage(){
 const[partners,setPartners]=useState<any[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[modal,setModal]=useState<any|null>(null);
 const load=async()=>{setLoading(true);setError('');try{const r=await getSiteSettings();setPartners(Array.isArray(r?.settings?.partners)?r.settings.partners:[])}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить партнёров')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const save=async(v:any)=>{setSaving(true);setError('');try{const r=await getSiteSettings();const current=Array.isArray(r?.settings?.partners)?r.settings.partners:[];let item={...(modal?.id?modal:{}),id:modal?.id??crypto.randomUUID(),name:String(v.name??'').trim(),description:String(v.description??'').trim(),tier:v.tier||'REGULAR',website:String(v.website??'').trim(),isActive:v.isActive!==false,sortOrder:Number(v.sortOrder??0),photoUrl:modal?.photoUrl??null};if(v.file instanceof File){const uploaded=await uploadSiteAsset('partner-'+item.id,v.file);item.photoUrl=uploaded.publicPath}const next=modal?.id?current.map((x:any)=>x.id===item.id?item:x):[...current,item];await updateSiteSettings({...r.settings,partners:next});setModal(null);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить партнёра')}finally{setSaving(false)}};
 const remove=async(id:string)=>{if(!confirm('Скрыть партнёра?'))return;try{const r=await getSiteSettings();const current=Array.isArray(r?.settings?.partners)?r.settings.partners:[];await updateSiteSettings({...r.settings,partners:current.map((x:any)=>x.id===id?{...x,isActive:false}:x)});await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось изменить статус')}};
 const tierName=(x:string)=>x==='GENERAL'?'Генеральный':x==='PREMIUM'?'Премиальный':'Обычный';
 return <PageFrame title="Партнёры" subtitle="Партнёры USD и размещение на публичном сайте" action={<button className="primary-button compact" onClick={()=>setModal({tier:'REGULAR',isActive:true,sortOrder:0})}><Plus size={15}/>Добавить партнёра</button>}>
  {error&&<ErrorPanel message={error} retry={load}/>}
  <div className="panel table-wrap">{loading?<LoadingPage small/>:partners.length?<table className="data-table"><thead><tr><th>Партнёр</th><th>Уровень</th><th>Описание</th><th>Сайт</th><th>Статус</th><th/></tr></thead><tbody>{partners.map((p:any)=><tr key={p.id}><td data-label="Партнёр"><strong>{p.name}</strong></td><td data-label="Уровень"><span className="badge">{tierName(p.tier)}</span></td><td data-label="Описание">{p.description||'—'}</td><td data-label="Сайт">{p.website||'—'}</td><td data-label="Статус"><span className={'badge '+(p.isActive?'good':'')}>{p.isActive?'Активен':'Скрыт'}</span></td><td data-label="Действия" className="row-actions"><button className="icon-button" onClick={()=>setModal(p)} title="Изменить">✎</button>{p.isActive&&<button className="secondary-button compact" onClick={()=>void remove(p.id)}>Скрыть</button>}</td></tr>)}</tbody></table>:<Empty text="Партнёров пока нет"/>}</div>
  {modal&&<Modal title={modal.id?'Редактирование партнёра':'Новый партнёр'} onClose={()=>setModal(null)}><PartnerForm value={modal} saving={saving} onSubmit={save}/></Modal>}
 </PageFrame>
}
function PartnerForm({value,saving,onSubmit}:{value:any;saving:boolean;onSubmit:(v:any)=>Promise<void>}){
 const[v,setV]=useState<any>({...value});
 return <form className="form modal-form" onSubmit={e=>{e.preventDefault();void onSubmit(v)}}>
  <div className="form-grid-2"><label>Название<input value={v.name??''} onChange={e=>setV({...v,name:e.target.value})} required/></label><label>Уровень<select value={v.tier??'REGULAR'} onChange={e=>setV({...v,tier:e.target.value})}><option value="GENERAL">Генеральный</option><option value="PREMIUM">Премиальный</option><option value="REGULAR">Обычный</option></select></label></div>
  <label>Описание<textarea value={v.description??''} onChange={e=>setV({...v,description:e.target.value})}/></label>
  <label>Сайт<input value={v.website??''} onChange={e=>setV({...v,website:e.target.value})} placeholder="https://"/></label>
  <div className="form-grid-2"><label>Порядок<input type="number" value={v.sortOrder??0} onChange={e=>setV({...v,sortOrder:Number(e.target.value)})}/></label><label className="checkbox-row"><input type="checkbox" checked={v.isActive!==false} onChange={e=>setV({...v,isActive:e.target.checked})}/>Показывать публично</label></div>
  <label>Фото / логотип<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setV({...v,file:e.target.files?.[0]??null})}/></label>
  {v.photoUrl&&<img className="partner-photo-preview" src={v.photoUrl} alt=""/>}
  <button className="primary-button" disabled={saving}>{saving?<><Loader2 className="spin" size={15}/>Сохраняем…</>:'Сохранить партнёра'}</button>
 </form>
}
function SiteSettingsPage(){
 const[settings,setSettings]=useState<any|null>(null),[tab,setTab]=useState('branding'),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[uploading,setUploading]=useState<string|null>(null),[error,setError]=useState(''),[saved,setSaved]=useState(false),[preview,setPreview]=useState<Record<string,string>>({}),[stages,setStages]=useState<any[]>([]);
 const load=async()=>{setLoading(true);setError('');try{const r=await getSiteSettings();setSettings(r.settings);for(const key of ['logoUrl','splashLogoUrl','mobileLogoUrl','faviconUrl']){getMediaUrl('SITE_ASSET','branding-'+key).then(url=>setPreview(x=>({...x,[key]:url}))).catch(()=>{})}}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить настройки')}try{const sr=await apiGet<any>('/stages');setStages(listData(sr))}catch{setStages([])}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 if(loading)return <PageFrame title="Настройки сайта" subtitle="Единый центр управления публичной частью USD"><LoadingPage/></PageFrame>;
 if(!settings)return <PageFrame title="Настройки сайта" subtitle="Единый центр управления публичной частью USD"><ErrorPanel message={error||'Настройки не найдены'} retry={load}/></PageFrame>;
 const patch=(section:string,value:any)=>setSettings((s:any)=>({...s,[section]:value}));
 const save=async()=>{setSaving(true);setSaved(false);setError('');try{await updateSiteSettings(settings);setSaved(true)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить настройки')}finally{setSaving(false)}};
 const uploadBrandingFile=async(key:string,file:File)=>{if(!file.type.startsWith('image/')){setError('Можно выбрать только изображение');return}setUploading(key);setError('');try{const assetKey='branding-'+key;const r=await uploadSiteAsset(assetKey,file);setPreview(x=>({...x,[key]:r.url}));if(key==='splashLogoUrl'){try{const reader=new FileReader();reader.onload=()=>{try{if(typeof reader.result==='string')localStorage.setItem('usd_splash_logo',reader.result)}catch{}};reader.readAsDataURL(file)}catch{try{localStorage.setItem('usd_splash_logo',r.url)}catch{}}}patch('branding',{...settings.branding,[key]:r.publicPath});}catch(e){setError((e as any)?.debug??(e instanceof Error?e.message:'Не удалось загрузить изображение'))}finally{setUploading(null)}};
 const blocks=settings.homepage.blocks??[];
 const moveBlock=(index:number,to:number)=>{if(to<0||to>=blocks.length)return;const next=[...blocks];const [item]=next.splice(index,1);next.splice(to,0,item);patch('homepage',{...settings.homepage,blocks:next})};
 const setBlock=(id:string,field:string,value:any)=>patch('homepage',{...settings.homepage,blocks:blocks.map((b:any)=>b.id===id?{...b,[field]:value}:b)});
 return <PageFrame title="Настройки сайта" subtitle="Публичный сайт, бренд, главная, LIVE, SEO и контент" action={<div className="settings-save-actions">{saved&&<span className="save-ok"><Check size={14}/>Сохранено</span>}<button className="primary-button compact" onClick={()=>void save()} disabled={saving}>{saving?<><Loader2 size={14} className="spin"/>Сохраняем…</>:<><Check size={14}/>Сохранить всё</>}</button></div>}>
  <div className="settings-layout"><aside className="settings-tabs">{[['branding','Брендинг',Settings2],['homepage','Главная',LayoutDashboard],['stream','Трансляция',Activity],['live','Результаты LIVE',Trophy],['contacts','Контакты',Users],['seo','SEO',Search],['legal','Юридическое',FileClock],['registration','Регистрация',ClipboardCheck],['footer','Подвал',Flag]].map(([id,label,I]:any)=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}><I size={16}/><span>{label}</span></button>)}</aside><section className="settings-content">{error&&<div className="notice"><AlertTriangle size={16}/>{error}</div>}   {tab==='branding'&&<div className="settings-section"><PanelTitle title="Брендинг" icon={Settings2}/><p className="settings-help">Выберите изображение с компьютера. Система сама загрузит его в защищённое хранилище; ссылки вручную больше не нужны.</p><div className="asset-grid">{[['logoUrl','Логотип шапки','PNG, JPG или WebP'],['splashLogoUrl','Логотип загрузки','Квадратный PNG, JPG или WebP'],['mobileLogoUrl','Мобильный логотип','PNG, JPG или WebP'],['faviconUrl','Иконка вкладки','PNG или WebP']].map(([key,title,hint]:any)=><div className="asset-card" key={key}><div className="asset-preview">{preview[key]?<img src={preview[key]} alt=""/>:<span>{settings.branding[key]?'Файл выбран':'USD'}</span>}</div><strong>{title}</strong><small>{hint}</small><label className="file-picker"><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading===key} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadBrandingFile(key,file);e.currentTarget.value=''}}/><span>{uploading===key?'Загружаем…':'Выбрать файл'}</span></label></div>)}</div><div className="settings-form-grid"><label>Название сайта<input value={settings.branding.siteName??''} onChange={e=>patch('branding',{...settings.branding,siteName:e.target.value})}/></label><label>Название организации<input value={settings.branding.organizationName??''} onChange={e=>patch('branding',{...settings.branding,organizationName:e.target.value})}/></label></div></div>}
   {tab==='homepage'&&<div className="settings-section"><PanelTitle title="Конструктор главной" icon={LayoutDashboard}/><p className="settings-help">Блоки можно включать, выключать и менять местами. Порядок сохраняется и будет использоваться публичной частью.</p><div className="settings-form-grid"><label>Заголовок<input value={settings.homepage.heroTitle??''} onChange={e=>patch('homepage',{...settings.homepage,heroTitle:e.target.value})}/></label><label>Подзаголовок<input value={settings.homepage.heroSubtitle??''} onChange={e=>patch('homepage',{...settings.homepage,heroSubtitle:e.target.value})}/></label></div><div className="block-sort-list">{blocks.map((b:any,i:number)=><div className="block-sort-row" key={b.id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',String(i))} onDragOver={e=>e.preventDefault()} onDrop={e=>{const from=Number(e.dataTransfer.getData('text/plain'));moveBlock(from,i)}}><span className="drag-handle">⋮⋮</span><div><strong>{b.title||b.id}</strong><small>{b.id}</small></div><input value={b.title??''} onChange={e=>setBlock(b.id,'title',e.target.value)}/><button className="icon-button" onClick={()=>moveBlock(i,i-1)} disabled={i===0}>↑</button><button className="icon-button" onClick={()=>moveBlock(i,i+1)} disabled={i===blocks.length-1}>↓</button><button className={`toggle-button ${b.enabled?'on':''}`} onClick={()=>setBlock(b.id,'enabled',!b.enabled)}>{b.enabled?'Включён':'Скрыт'}</button></div>)}</div></div>}
   {tab==='stream'&&<div className="settings-section"><PanelTitle title="Прямая трансляция" icon={Activity}/><p className="settings-help">Настрой трансляцию заранее. В день этапа блок может автоматически появляться на главной.</p><div className="settings-form-grid"><label className="checkbox-row"><input type="checkbox" checked={!!settings.stream.enabled} onChange={e=>patch('stream',{...settings.stream,enabled:e.target.checked})}/>Показывать трансляцию</label><label>Провайдер<select value={settings.stream.provider??'YOUTUBE'} onChange={e=>patch('stream',{...settings.stream,provider:e.target.value})}><option>YOUTUBE</option><option>VK</option><option>RUTUBE</option><option>CUSTOM</option></select></label><label>Название трансляции<input value={settings.stream.title??''} onChange={e=>patch('stream',{...settings.stream,title:e.target.value})}/></label><label>Ссылка на трансляцию<input value={settings.stream.url??''} onChange={e=>patch('stream',{...settings.stream,url:e.target.value})}/></label><label>Embed URL<input value={settings.stream.embedUrl??''} onChange={e=>patch('stream',{...settings.stream,embedUrl:e.target.value})}/></label><label className="checkbox-row"><input type="checkbox" checked={!!settings.stream.autoShowOnStageDay} onChange={e=>patch('stream',{...settings.stream,autoShowOnStageDay:e.target.checked})}/>Автоматически показывать в день этапа</label><label className="checkbox-row"><input type="checkbox" checked={!!settings.stream.showChat} onChange={e=>patch('stream',{...settings.stream,showChat:e.target.checked})}/>Показывать чат</label></div></div>}
   {tab==='live'&&<div className="settings-section"><PanelTitle title="Результаты LIVE" icon={Trophy}/><p className="settings-help">Публичный фронт сможет автоматически обновлять результаты. Интервал 2–60 секунд.</p><div className="settings-form-grid"><label className="checkbox-row"><input type="checkbox" checked={!!settings.liveResults.enabled} onChange={e=>patch('liveResults',{...settings.liveResults,enabled:e.target.checked})}/>LIVE-результаты включены</label><label>Этап LIVE<select value={settings.liveResults.stageId??''} onChange={e=>patch('liveResults',{...settings.liveResults,stageId:e.target.value||null})}><option value="">Не выбран</option>{stages.map((s:any)=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}</select></label><label>Автообновление, сек.<input type="number" min="2" max="60" value={settings.liveResults.refreshSeconds??5} onChange={e=>patch('liveResults',{...settings.liveResults,refreshSeconds:Number(e.target.value)})}/></label><label className="checkbox-row"><input type="checkbox" checked={!!settings.liveResults.showOnlyPublished} onChange={e=>patch('liveResults',{...settings.liveResults,showOnlyPublished:e.target.checked})}/>Показывать только опубликованные результаты</label></div></div>}
   {tab==='contacts'&&<SettingsMap title="Контакты и соцсети" section="contacts" settings={settings} patch={patch} fields={['phone','email','address','telegram','vk','youtube','rutube','whatsapp']}/>}
   {tab==='seo'&&<SettingsMap title="SEO" section="seo" settings={settings} patch={patch} fields={['title','description','keywords','ogTitle','ogDescription','ogImage','canonical']}/>}
   {tab==='legal'&&<SettingsMap title="Юридическая информация" section="legal" settings={settings} patch={patch} fields={['ipName','inn','ogrnip','copyrightHolder','privacyUrl','consentUrl','termsUrl','rulesUrl']}/>}
   {tab==='footer'&&<SettingsMap title="Подвал сайта" section="footer" settings={settings} patch={patch} fields={['copyright','text','phone','email']}/>}
   {tab==='registration'&&<SettingsMap title="Регистрация" section="registration" settings={settings} patch={patch} fields={['enabled','price','additionalClassPrice','introText','successText','rulesText']}/>}
  </section></div></PageFrame>
}
function SettingsMap({title,section,settings,patch,fields}:{title:string;section:string;settings:any;patch:(s:string,v:any)=>void;fields:string[]}){const data=settings[section]??{};const labels:Record<string,string>={phone:'Телефон',email:'Email',address:'Адрес',telegram:'Telegram',vk:'VK',youtube:'YouTube',rutube:'RuTube',whatsapp:'WhatsApp',title:'Заголовок страницы',description:'Описание',keywords:'Ключевые слова',ogTitle:'OG-заголовок',ogDescription:'OG-описание',ogImage:'OG-изображение',canonical:'Canonical URL',ipName:'ФИО / наименование ИП',inn:'ИНН',ogrnip:'ОГРНИП',copyrightHolder:'Правообладатель',privacyUrl:'Политика конфиденциальности',consentUrl:'Согласие на обработку данных',termsUrl:'Пользовательское соглашение',rulesUrl:'Правила USD',copyright:'Копирайт',text:'Текст подвала',enabled:'Регистрация включена',price:'Стоимость участия',additionalClassPrice:'Стоимость дополнительного класса',introText:'Текст перед регистрацией',successText:'Сообщение после регистрации',rulesText:'Условия регистрации'};const textareas=new Set(['description','ogDescription','text','introText','successText','rulesText']);const urlFields=new Set(['telegram','vk','youtube','rutube','whatsapp','ogImage','canonical','privacyUrl','consentUrl','termsUrl','rulesUrl']);return <div className="settings-section"><PanelTitle title={title} icon={Settings2}/><p className="settings-help">Здесь находятся параметры этого раздела. Заполняйте только то, что действительно используется на публичном сайте.</p><div className="settings-form-grid">{fields.map(k=>{const bool=typeof data[k]==='boolean';return <label key={k} className={bool?'settings-check':''}><span className="field-label">{labels[k]??humanize(k)}</span>{bool?<span className="setting-toggle-line"><input type="checkbox" checked={!!data[k]} onChange={e=>patch(section,{...data,[k]:e.target.checked})}/><b>{data[k]?'Включено':'Выключено'}</b></span>:textareas.has(k)?<textarea rows={4} value={data[k]??''} placeholder={k==='description'?'Коротко опишите USD для поисковиков…':''} onChange={e=>patch(section,{...data,[k]:e.target.value})}/>:<input type={urlFields.has(k)?'url':k.toLowerCase().includes('email')?'email':k==='price'||k==='additionalClassPrice'?'number':'text'} value={data[k]??''} onChange={e=>patch(section,{...data,[k]:e.target.value})}/>} {!bool&&<small className="field-help">{urlFields.has(k)?'Стабильная публичная ссылка':k==='price'||k==='additionalClassPrice'?'Сумма в рублях':'Можно оставить пустым, если параметр не используется.'}</small>}</label>})}</div></div>}
function AssistantPage({go}:{go:(p:string)=>void}){
 const [messages,setMessages]=useState<any[]>([{role:'assistant',text:'Привет. Я USD Copilot. Просто разговаривай со мной как с живым помощником: опиши, что хочешь проверить, найти или изменить. Я сам разберусь с контекстом системы и отвечу по делу.'}]);
 const [input,setInput]=useState(''),[sending,setSending]=useState(false),[error,setError]=useState('');
 const [confirming,setConfirming]=useState<any|null>(null),[confirmation,setConfirmation]=useState('');
 const send=async(text?:string)=>{
  const value=(text??input).trim();if(!value||sending)return;
  setMessages(m=>[...m,{role:'user',text:value}]);setInput('');setSending(true);setError('');
  try{
   const r=await chatAssistant(value);
   setMessages(m=>[...m,{role:'assistant',text:r.reply,action:r.action,data:r.data}]);
   if(r.action?.type==='CHANGE_REQUEST') setConfirming(r.action);
  }catch(e){setError(e instanceof Error?e.message:'Ассистент временно недоступен');setMessages(m=>[...m,{role:'assistant',text:'Не смог обработать запрос. Проверь доступность сервера и попробуй ещё раз.'}]);}
  finally{setSending(false)}
 };
 const confirmChange=async()=>{
  if(!confirming?.id)return;
  if(confirmation.trim().toUpperCase()!=='ПОДТВЕРЖДАЮ'){setError('Введите «ПОДТВЕРЖДАЮ», чтобы подтвердить изменение');return}
  setSending(true);setError('');
  try{
   const r=await approveAssistantRequest(confirming.id,confirmation);
   setMessages(m=>[...m,{role:'assistant',text:'Подтверждение получено. Запрос принят в защищённый контур. Если для задачи требуется изменение кода, система не выполняет его напрямую — оно должно пройти через отдельный исполнитель изменений.' ,data:r.execution}]);
   setConfirming(null);setConfirmation('');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось подтвердить изменение')}
  finally{setSending(false)}
 };
 const rejectChange=async()=>{
  if(!confirming?.id)return;
  setSending(true);setError('');
  try{await rejectAssistantRequest(confirming.id);setMessages(m=>[...m,{role:'assistant',text:'Хорошо, изменение не выполняю.'}]);setConfirming(null);setConfirmation('')}
  catch(e){setError(e instanceof Error?e.message:'Не удалось отклонить изменение')}
  finally{setSending(false)}
 };
 const runFunction=async(code:string,title:string)=>{
  setSending(true);setError('');
  try{const r=await executeAssistantFunction(code,{});setMessages(m=>[...m,{role:'assistant',text:`Готово. ${title} выполнена.`,data:r.result}])}
  catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить проверку')}
  finally{setSending(false)}
 };
 return <PageFrame title="Ассистент USD" subtitle="Живой рабочий диалог с AI: спрашивайте, проверяйте и ставьте задачи обычным языком." action={<span className="badge good"><Sparkles size={12}/>USD COPILOT</span>}>
  <div className="assistant-chat-layout assistant-chat-layout-single">
   <section className="assistant-chat panel">
    <div className="assistant-chat-head">
     <div className="assistant-avatar"><Bot size={21}/></div>
     <div><strong>USD Copilot</strong><span>Говорите обычным языком — я вижу актуальное состояние USD</span></div>
     <button className="secondary-button compact" onClick={()=>setMessages([{role:'assistant',text:'Новый диалог начат. Что делаем?'}])}>Новый чат</button>
    </div>
    <div className="assistant-messages">
     {messages.map((m:any,i:number)=><div key={i} className={'assistant-message '+m.role}>
      <div className="message-avatar">{m.role==='assistant'?<Bot size={15}/>:<UserRound size={15}/>}</div>
      <div className="message-bubble">
       <div className="assistant-message-text">{m.text}</div>
       {m.data&&<details className="assistant-data"><summary>Показать данные проверки</summary><pre>{JSON.stringify(m.data,null,2)}</pre></details>}
      </div>
     </div>)}
     {sending&&<div className="assistant-message assistant"><div className="message-avatar"><Bot size={15}/></div><div className="message-bubble typing">анализирую<span>.</span><span>.</span><span>.</span></div></div>}
    </div>
    <div className="assistant-chat-suggestions">{['Что сейчас требует внимания?','Проверь качество данных','Проверь текущий этап','Разбери последний импорт','Покажи состояние системы'].map(x=><button key={x} onClick={()=>void send(x)} disabled={sending}>{x}</button>)}</div>
    {confirming&&<div className="assistant-inline-confirm">
      <div className="assistant-inline-confirm-head"><div className="assistant-avatar small"><LockKeyhole size={16}/></div><div><strong>Нужно подтверждение</strong><span>Я подготовил действие, но сам его не применю без вашего согласия.</span></div></div>
      <div className="assistant-inline-confirm-body"><b>{confirming.title||'Изменение'}</b><p>{confirming.prompt||'Запрос подготовлен по вашему сообщению.'}</p><small>Риск: {assistantRiskName(confirming.risk||'Средний')}</small></div>
      <div className="assistant-inline-confirm-actions"><input value={confirmation} onChange={e=>setConfirmation(e.target.value)} placeholder="Введите ПОДТВЕРЖДАЮ"/><button className="primary-button compact" onClick={()=>void confirmChange()} disabled={sending}>Подтвердить</button><button className="secondary-button compact" onClick={()=>void rejectChange()} disabled={sending}>Не выполнять</button></div>
    </div>}
    {error&&<div className="form-error"><AlertTriangle size={15}/>{error}</div>}
    <form className="assistant-composer" onSubmit={e=>{e.preventDefault();void send()}}>
     <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Например: «проверь текущий этап и скажи, что мешает его провести»" rows={3} disabled={sending}/>
     <button className="primary-button" disabled={!input.trim()||sending}>{sending?<Loader2 size={17} className="spin"/>:<Sparkles size={17}/>}Отправить</button>
    </form>
    <div className="assistant-chat-note"><LockKeyhole size={13}/><span>Обычный разговор не создаёт очередь. Если ты просишь что-то изменить, я сначала покажу действие и попрошу явное подтверждение.</span></div>
   </section>
  </div>
 </PageFrame>
}
function assistantStatusName(x:string){const m:Record<string,string>={DRAFT:'Черновик',PENDING:'Ожидает подтверждения',APPROVED:'Подтверждено',REJECTED:'Отклонено',APPLIED:'Применено',CANCELLED:'Отменено'};return m[x]??enumLabel(x)}
function assistantTypeName(x:string){return ({CODE_CHANGE:'Изменение кода',ASSISTANT_FUNCTION:'Функция ассистента',SYSTEM_ACTION:'Действие системы'} as Record<string,string>)[x]??enumLabel(x)}
function assistantRiskName(x:string){return ({Низкий:'Низкий',Средний:'Средний',Высокий:'Высокий',Критический:'Критический',low:'Низкий',medium:'Средний',high:'Высокий',critical:'Критический'} as Record<string,string>)[x]??enumLabel(x)}
function GlobalSearch({onClose,go}:{onClose:()=>void;go:(p:string)=>void}){
 const[q,setQ]=useState(''),[results,setResults]=useState<any[]>([]),[loading,setLoading]=useState(false);
 useEffect(()=>{const t=setTimeout(async()=>{if(q.trim().length<2){setResults([]);return}setLoading(true);try{const r=await apiGet<any>('/statistics/participants?search='+encodeURIComponent(q.trim())+'&limit=12');const ps=listData(r).map((x:any)=>({type:'Участник',title:[x.lastName,x.firstName,x.middleName].filter(Boolean).join(' '),path:'/admin/participants'}));const cs=listData(await apiGet<any>('/cars')).filter((x:any)=>JSON.stringify(x).toLowerCase().includes(q.toLowerCase())).slice(0,8).map((x:any)=>({type:'Автомобиль',title:[x.brand,x.model,x.registrationNumber].filter(Boolean).join(' '),path:'/admin/cars'}));setResults([...ps,...cs])}catch{setResults([])}finally{setLoading(false)}},220);return()=>clearTimeout(t)},[q]);
 return <div className="search-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="global-search"><div className="global-search-head"><Search size={18}/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Участник, автомобиль, госномер…"/><button className="icon-button" onClick={onClose}><X size={17}/></button></div>{loading?<LoadingPage small/>:results.length?<div className="global-search-results">{results.map((r,i)=><button key={i} onClick={()=>{onClose();go(r.path)}}><span>{r.type}</span><strong>{r.title}</strong><ChevronRight size={16}/></button>)}</div>:<div className="global-search-empty">{q.length>1?'Ничего не найдено':'Начни вводить минимум 2 символа'}</div>}</div></div>}

function Coming({title,icon:Icon,user}:{title:string;icon:any;user:User}){return <PageFrame title={title} subtitle={user.role==='JUDGE'?'Раздел доступен в режиме судьи':'Управление разделом USD'}><div className="panel feature-placeholder"><div className="placeholder-icon"><Icon size={28}/></div><h2>Раздел готовится</h2><p>Каркас подключён. Интерфейс будет расширяться поверх реального API без изменения серверных прав.</p></div></PageFrame>}

function PageFrame({title,subtitle,children,action,showHelp=true}:{title:string;subtitle:string;children:React.ReactNode;action?:React.ReactNode;showHelp?:boolean}){
 const tips:Record<string,string>={'Панель управления':'Главный рабочий стол. Здесь собраны текущий этап, задачи и быстрые действия.','Этапы':'Создавайте этапы, открывайте регистрацию, назначайте классы и управляйте публикацией.','Регистрации':'Рабочий список заявок на этап. Здесь удобно искать участника, автомобиль и класс.','Инспекции':'Проверка автомобилей перед выступлением. Сначала выберите этап, затем обработайте очередь по статусам.','Результаты':'Вносите и контролируйте спортивные результаты. Изменение и удаление защищены правами доступа.','Участники':'Единый справочник спортсменов. История выступлений не теряется при повторных регистрациях.','Автомобили':'Справочник автомобилей участников. Один автомобиль может использоваться в нескольких этапах.','Сезоны':'Сезоны чемпионата и их жизненный цикл: черновик, активный, архивный.','Классы':'Спортивные классы и направления. Сначала настройте справочник, затем подключайте классы к этапам.','Импорт':'Загрузка данных с предварительной проверкой. В историческом импорте «Результаты» — источник факта участия, «Регистрация» — справочник.','История результатов':'Исторические выступления. Результаты являются источником факта участия, регистрация используется как справочник.','Контроль данных':'Поиск потенциальных проблем в данных перед публикацией и проведением этапов.','Дисквалификации':'Управление действующими и отозванными дисквалификациями.','Рекорды':'Текущие рекорды, синхронизированные с подтверждёнными результатами.','Статистика':'Сводная спортивная статистика по участникам, этапам и выступлениям.','Пользователи':'Учётные записи, роли и доступ. ADMIN имеет полный доступ, JUDGE — рабочий доступ судьи.','Аудит':'Полная история действий системы: пользователи, справочники, этапы, регистрации, инспекции, результаты, импорт, медиа, настройки и ассистент.','Настройки сайта':'Единый центр настройки публичного сайта: бренд, главная, LIVE, контакты, SEO и юридические данные.','Ассистент USD':'Операционный AI-помощник USD: статистика, диагностика и управляемые изменения с подтверждением в чате.'};
 const flows:Record<string,string[]>={'Этапы':['1 · Создать этап','2 · Подключить классы','3 · Открыть регистрацию','4 · Провести этап'],'Регистрации':['1 · Выбрать этап','2 · Найти участника','3 · Проверить авто и классы','4 · Допустить'],'Инспекции':['1 · Выбрать этап','2 · Найти №','3 · Проверить авто','4 · Отметить результат'],'Результаты':['1 · Выбрать этап','2 · Выбрать класс','3 · Внести результат','4 · Проверить место'],'Импорт':['1 · Загрузить','2 · Проверить','3 · Исправить предупреждения','4 · Зафиксировать'],'Настройки сайта':['1 · Бренд','2 · Главная','3 · LIVE','4 · Сохранить'],'Ассистент USD':['1 · Описать задачу','2 · Получить план','3 · Подтвердить','4 · Применить через защищённый контур']} ;
 return <div className="page"><div className="page-heading"><div><div className="eyebrow">USD · ADMIN PANEL</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>{showHelp&&tips[title]&&<div className="admin-help-card"><div className="admin-help-icon"><Info size={17}/></div><div className="admin-help-copy"><strong>{tips[title]}</strong><p>Заполняйте только известные данные. Система проверяет обязательные поля, связи и права доступа.</p>{flows[title]&&<div className="admin-flow">{flows[title].map((x,i)=><span key={i}>{x}</span>)}</div>}</div></div>}{children}</div>}
function PanelTitle({title,icon:Icon,action,onAction}:{title:string;icon:any;action?:string;onAction?:()=>void}){return <div className="panel-title"><div><Icon size={17}/><h2>{title}</h2></div>{action&&<button className="text-button" onClick={onAction}>{action}<ChevronRight size={14}/></button>}</div>}
function DataTable({rows,columns,onEdit,onDelete,extraAction}:{rows:any[];columns:{key:string;label:string}[];onEdit?:(row:any)=>void;onDelete?:(id:string)=>void;extraAction?:(row:any)=>React.ReactNode}){if(!rows.length)return <Empty text="Записей пока нет"/>;return <div className="smart-table-wrap"><table className="data-table"><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}{(onEdit||onDelete||extraAction)&&<th className="actions-head">Действия</th>}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id??i}>{columns.map(c=><td key={c.key} data-label={c.label}>{formatCell(getPath(r,c.key),c.key)}</td>)}{(onEdit||onDelete||extraAction)&&<td className="row-actions" data-label="Действия">{extraAction?.(r)}{onEdit&&<button className="icon-button" onClick={()=>onEdit(r)} title="Изменить" aria-label="Изменить"><Pencil size={15}/></button>}{onDelete&&r.id&&<button className="icon-button danger" onClick={()=>void onDelete(r.id)} title="Удалить" aria-label="Удалить"><Trash2 size={15}/></button>}</td>}</tr>)}</tbody></table></div>}
function autoColumns(rows:any[]){const first=rows[0]??{};return Object.keys(first).filter(k=>!['id','createdAt','updatedAt','deletedAt'].includes(k)&&!k.endsWith('Id')&&!k.endsWith('Ids')&&typeof first[k]!=='object').slice(0,8).map(k=>({key:k,label:humanize(k)}))}
function getPath(o:any,path:string){return path.split('.').reduce((a,k)=>a?.[k],o)}
function formatCell(v:any,key=''){if(v===null||v===undefined)return '—';if(typeof v==='boolean')return v?<span className="badge good"><Check size={11}/>Да</span>:<span className="badge">Нет</span>;if(typeof v==='string'&&v.includes('T')&&!Number.isNaN(Date.parse(v)))return formatDate(v);if(['status','verificationStatus','unit','direction','type','scope','role','risk'].includes(key)||key.toLowerCase().includes('status'))return <span className="badge">{enumLabel(v)}</span>;return String(v)}
function humanize(s:string){const m:Record<string,string>={participantNumber:'Номер участника',resultUnit:'Единица результата',classUnit:'Единица класса',recordUnit:'Единица рекорда',warningRows:'Строки с предупреждениями',registrationId:'Регистрация',classId:'Класс',participantId:'Участник',carId:'Автомобиль',stageId:'Этап',seasonId:'Сезон',verifiedByUserId:'Кем подтверждено',createdByUserId:'Кем создано',checkedByUserId:'Кем проверено'};return m[s]??s.replace(/([A-Z])/g,' $1').replace(/[_-]/g,' ').replace(/^./,x=>x.toUpperCase())}
const enumLabels:Record<string,string>={ADMIN:'Администратор',JUDGE:'Судья',PARTICIPANT:'Участник',DRAFT:'Черновик',ACTIVE:'Активен',INACTIVE:'Неактивен',PUBLISHED:'Опубликован',COMPLETED:'Завершён',CANCELLED:'Отменён',ARCHIVED:'Архивный',PASSED:'Прошёл',FAILED:'Не прошёл',PENDING:'Ожидает проверки',VERIFIED:'Подтверждён',READY:'Готово',WARNING:'Предупреждение',RESOLVED:'Исправлено',COMMITTED:'Зафиксирован',FRONT:'Фронт',REAR:'Тыл',SUB:'Сабвуфер',SUBWOOFER:'Сабвуфер',MIDBASS:'Мидбас',MIDRANGE:'Среднечастотник',HORN:'Рупор',OTHER:'Другое',DB:'дБ',MPS:'м/с',STAGE:'Этап',SEASON:'Сезон',FORMAT:'Формат',APPROVED:'Подтверждено',REJECTED:'Отклонено',APPLIED:'Применено',PRE_REGISTRATION:'Предварительная регистрация',ON_SITE:'На площадке',IMPORT:'Импорт',REGISTRATION:'Регистрация',RESULT:'Результат',NORMAL:'Обычный импорт',HISTORICAL:'Исторический импорт',AUTO:'Автоматически',NONE:'Нет',BOTH:'Оба'};
function enumLabel(value:any){if(value===null||value===undefined||value==='')return '';if(typeof value!=='string')return String(value);return enumLabels[value]??humanize(value)}
function fieldPlaceholder(f:Field){if(f.placeholder)return f.placeholder;const p:Record<string,string>={name:'Например: USD Тюмень 2026',lastName:'Фамилия',firstName:'Имя',middleName:'Отчество (необязательно)',city:'Например: Тюмень',team:'Название команды',phone:'+7 900 000-00-00',venue:'Название площадки',address:'Адрес проведения',description:'Короткое описание…',registrationNumber:'Госномер',brand:'Например: Lada',model:'Например: Priora',color:'Например: чёрный'};return p[f.name]??'';}
function EntityForm({fields,initial,saving,relationOptions={},onSubmit}:{fields:Field[];initial:any;saving:boolean;relationOptions?:Record<string,any[]>;onSubmit:(v:any)=>Promise<void>}){const[v,setV]=useState<any>(initial??{});const renderControl=(f:Field)=>{const opts=relationOptions[f.name]??[];const inputValue=f.type==='date'&&typeof v[f.name]==='string'?v[f.name].slice(0,10):f.type==='datetime-local'&&typeof v[f.name]==='string'?v[f.name].slice(0,16):v[f.name]??'';if(f.type==='checkbox')return <div className="field-check"><input type="checkbox" checked={v[f.name]===true} onChange={e=>setV({...v,[f.name]:e.target.checked})}/><span><b>{f.label}</b>{f.help&&<small>{f.help}</small>}</span></div>;if(f.optionsPath)return <select value={v[f.name]??''} onChange={e=>setV({...v,[f.name]:e.target.value})} required={f.required}><option value="">Выберите…</option>{opts.map(o=><option key={o.id} value={o.id}>{f.optionLabel?f.optionLabel(o):o.name??o.id}</option>)}</select>;if(f.options)return <select value={v[f.name]??''} onChange={e=>setV({...v,[f.name]:e.target.value})} required={f.required}><option value="">Выберите…</option>{f.options.map(o=><option key={o} value={o}>{enumLabel(o)}</option>)}</select>;if(f.type==='textarea')return <textarea rows={4} value={v[f.name]??''} placeholder={fieldPlaceholder(f)} onChange={e=>setV({...v,[f.name]:e.target.value})}/>;return <input type={f.type??'text'} value={inputValue} placeholder={fieldPlaceholder(f)} onChange={e=>setV({...v,[f.name]:f.type==='number'?(e.target.value===''?undefined:Number(e.target.value)):e.target.value})} required={f.required}/>;};return <form className="form modal-form" onSubmit={e=>{e.preventDefault();void onSubmit(clean(v))}}><div className="form-intro"><Info size={17}/><span>{initial?.id?'Вы редактируете существующую запись. Изменяйте только то, что действительно нужно.':'Заполните известные данные. Система сама проверит связи и обязательные поля.'} Обязательные поля отмечены <b>*</b>.</span></div><div className="entity-fields">{fields.map(f=><label key={f.name} className={f.type==='checkbox'?'checkbox-row field-wrapper':''}><span className="field-label">{f.type==='checkbox'?null:<>{f.label}{f.required&&<em>*</em>}</>}</span>{renderControl(f)}{f.type!=='checkbox'&&f.help&&<small className="field-help">{f.help}</small>}</label>)}</div><button className="primary-button save-button" disabled={saving}>{saving?<><Loader2 className="spin" size={16}/>Сохраняем…</>:<><Check size={16}/>Сохранить изменения</>}</button></form>}

function clean(v:any){return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==''&&x!==undefined))}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){const content=<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><strong>{title}</strong><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={17}/></button></div>{children}</div></div>;return createPortal(content,document.body)}
function LoadingPage({small=false}:{small?:boolean}){return <div className={small?'loading-small':'loading-page'}><Loader2 className="spin"/><span>Загрузка…</span></div>}
function ErrorPanel({message,retry}:{message:string;retry:()=>Promise<any>|any}){return <div className="error-panel"><AlertTriangle/><div><strong>Не удалось загрузить данные</strong><p>{message}</p><button className="text-button" onClick={()=>void retry()}>Повторить</button></div></div>}
function Empty({text}:{text:string}){return <div className="empty-state"><Activity size={20}/><span>{text}</span></div>}
function formatDate(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric'}).format(d)}
export default App;
