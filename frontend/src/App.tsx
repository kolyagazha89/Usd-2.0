import {useEffect,useMemo,useState} from 'react';
import {Activity,AlertTriangle,BarChart3,Bell,CalendarDays,CarFront,Check,ChevronRight,ClipboardCheck,Database,FileClock,FileInput,Flag,Gauge,History,LayoutDashboard,Loader2,LogOut,Menu,Plus,RefreshCw,Search,Settings2,ShieldAlert,Trophy,UserRound,Users,X} from 'lucide-react';
import {apiDelete,apiGet,apiPatch,apiPost,apiPut,getAudit,getDashboard,getDataQuality,listData,login,logout,refresh,type Dashboard,type Role,type User} from './api';

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
];
const roleName:Record<Role,string>={ADMIN:'Администратор',JUDGE:'Судья',PARTICIPANT:'Участник'};

function App(){
 const[user,setUser]=useState<User|null>(null),[booting,setBooting]=useState(true),[path,setPath]=useState(location.pathname),[mobileOpen,setMobileOpen]=useState(false);
 useEffect(()=>{refresh().then(r=>setUser(r?.user??null)).finally(()=>setBooting(false));const f=()=>setPath(location.pathname);addEventListener('popstate',f);return()=>removeEventListener('popstate',f)},[]);
 const go=(p:string)=>{history.pushState({},'',p);setPath(p);setMobileOpen(false)};
 if(booting)return <Splash/>;
 if(!user)return <LoginScreen onLogin={async(e,p)=>setUser(await login(e,p))}/>;
 if(user.role==='PARTICIPANT')return <AccessDenied onLogout={async()=>{await logout();setUser(null)}}/>;
 return <Shell user={user} path={path} go={go} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} onLogout={async()=>{await logout();setUser(null);go('/')}}/>;
}
function Splash(){return <div className="splash"><div className="brand-mark">USD</div><div className="loader"/></div>}
function LoginScreen({onLogin}:{onLogin:(e:string,p:string)=>Promise<void>}){const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);return <div className="login-page"><div className="login-grid"/><div className="login-card"><div className="brand-lockup"><div className="brand-mark">USD</div><span>2.0</span></div><div className="eyebrow">Competition Management System</div><h1>С возвращением</h1><p className="muted">Войдите в административную панель USD.</p><form className="form" onSubmit={async e=>{e.preventDefault();setError('');setLoading(true);try{await onLogin(email,password)}catch(x){setError(x instanceof Error?x.message:'Не удалось выполнить вход')}finally{setLoading(false)}}}><label>Email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="username" required/></label><label>Пароль<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required/></label>{error&&<div className="form-error"><AlertTriangle size={16}/>{error}</div>}<button className="primary-button" disabled={loading}>{loading?'Входим…':'Войти'}<ChevronRight size={18}/></button></form><div className="login-footer"><span>USD Russia</span><span>Secure access</span></div></div></div>}
function AccessDenied({onLogout}:{onLogout:()=>Promise<void>}){return <div className="center-page"><div className="empty-card"><ShieldAlert size={36}/><h2>Нет доступа к панели</h2><p className="muted">Учётная запись участника не имеет доступа к Admin Panel.</p><button className="secondary-button" onClick={()=>void onLogout()}>Выйти</button></div></div>}

function Shell({user,path,go,mobileOpen,setMobileOpen,onLogout}:{user:User;path:string;go:(p:string)=>void;mobileOpen:boolean;setMobileOpen:(v:boolean)=>void;onLogout:()=>Promise<void>}){
 const visible=useMemo(()=>nav.filter(n=>n.roles.includes(user.role)),[user.role]),active=visible.find(n=>path===n.path||(n.path!=='/admin'&&path.startsWith(n.path)));
 return <div className="app-shell"><aside className={`sidebar ${mobileOpen?'open':''}`}><div className="sidebar-top"><button className="brand-button" onClick={()=>go('/admin')}><span className="brand-mark small">USD</span><span className="brand-title">USD <b>2.0</b></span></button><button className="icon-button mobile-close" onClick={()=>setMobileOpen(false)}><X size={19}/></button></div><div className="sidebar-label">Управление</div><nav>{visible.map(n=>{const I=n.icon;return <button key={n.path} className={`nav-item ${active?.path===n.path?'active':''}`} onClick={()=>go(n.path)}><I size={18}/><span>{n.label}</span>{active?.path===n.path&&<span className="nav-dot"/>}</button>})}</nav><div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{(user.name??user.email).slice(0,1).toUpperCase()}</div><div><strong>{user.name||'Пользователь'}</strong><small>{roleName[user.role]}</small></div></div><button className="logout-button" onClick={()=>void onLogout()}><LogOut size={17}/>Выйти</button></div></aside>{mobileOpen&&<button className="mobile-backdrop" onClick={()=>setMobileOpen(false)}/>}<main className="main"><header className="topbar"><button className="icon-button menu-button" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><div className="breadcrumb"><span>USD 2.0</span><ChevronRight size={14}/><strong>{active?.label??'Панель'}</strong></div><div className="topbar-actions"><div className="role-pill">{user.role==='JUDGE'?'JUDGE MODE':'ADMIN MODE'}</div></div></header><div className="content"><Page path={path} go={go} user={user}/></div></main></div>
}

function Page({path,go,user}:{path:string;go:(p:string)=>void;user:User}){
 if(path==='/admin'||path==='/admin/')return <DashboardPage go={go}/>;
 if(path.startsWith('/admin/participants'))return <ParticipantsPage go={go}/>;
 if(path.startsWith('/admin/cars'))return <CarsPage user={user}/>;
 if(path.startsWith('/admin/seasons'))return <SeasonsPage/>;
 if(path.startsWith('/admin/stages'))return <StagesPage go={go}/>;
 if(path.startsWith('/admin/classes'))return <ClassesPage/>;
 if(path.startsWith('/admin/registrations'))return <RegistrationsPage/>;
 if(path.startsWith('/admin/inspections'))return <InspectionsPage/>;
 if(path.startsWith('/admin/results'))return <ResultsPage/>;
 if(path.startsWith('/admin/disqualifications'))return <DisqualificationsPage/>;
 if(path.startsWith('/admin/historical-results'))return <HistoricalPage/>;
 if(path.startsWith('/admin/import'))return <ImportPage/>;
 if(path.startsWith('/admin/records'))return <RecordsPage/>;
 if(path.startsWith('/admin/statistics'))return <StatisticsPage/>;
 if(path.startsWith('/admin/users'))return <UsersPage/>;
 if(path.startsWith('/admin/audit'))return <AuditPage/>;
 if(path.startsWith('/admin/data-quality'))return <QualityPage/>;
 return <Coming title="Пользователи" icon={UserRound} user={user}/>;
}

function DashboardPage({go}:{go:(p:string)=>void}){
 const[data,setData]=useState<Dashboard|null>(null),[error,setError]=useState('');
 const load=()=>getDashboard().then(setData).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки'));
 useEffect(()=>{void load()},[]);
 if(error)return <ErrorPanel message={error} retry={load}/>;
 if(!data)return <LoadingPage/>;
 const stage=data.currentStage;
 const regs=data.activeRegistrationStats;
 return <PageFrame title="Dashboard" subtitle="Операционный центр USD 2.0" action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
  <section className="dashboard-grid">
   <div className="panel dashboard-stage-card">
    <PanelTitle title={stage?'Текущий этап':'Ближайший этап'} icon={Flag}/>
    {stage?<button className="dashboard-feature" onClick={()=>go('/admin/stages')}>
      <div className="stage-number large">{stage.stageNumber}</div>
      <div className="stage-main"><strong>{stage.name}</strong><span>{stage.city||'—'} · {formatDate(stage.date)}</span><small>{stage.registrationOpen?'Регистрация открыта':'Регистрация закрыта'}</small></div>
      <ChevronRight size={20}/>
    </button>:data.upcomingStages[0]?<button className="dashboard-feature" onClick={()=>go('/admin/stages')}>
      <div className="stage-number large">{data.upcomingStages[0].stageNumber}</div>
      <div className="stage-main"><strong>{data.upcomingStages[0].name}</strong><span>{data.upcomingStages[0].city||'—'} · {formatDate(data.upcomingStages[0].date)}</span><small>{data.upcomingStages[0].registrationOpen?'Регистрация открыта':'Регистрация закрыта'}</small></div>
      <ChevronRight size={20}/>
    </button>:<Empty text="Будущих этапов пока нет"/>}
   </div>
   <div className="panel">
    <PanelTitle title="Активные регистрации" icon={ClipboardCheck}/>
    <button className="dashboard-registration" onClick={()=>go('/admin/registrations')}>
      <div className="registration-total"><strong>{regs.registrations.toLocaleString('ru-RU')}</strong><span>регистраций</span></div>
      <div className="registration-breakdown"><div><strong>{regs.participants.toLocaleString('ru-RU')}</strong><span>участников</span></div><div><strong>{regs.cars.toLocaleString('ru-RU')}</strong><span>автомобилей</span></div></div>
      <ChevronRight size={20}/>
    </button>
   </div>
  </section>
  <section className="panel dashboard-info">
   <PanelTitle title="Состояние системы" icon={Activity}/>
   <div className="dashboard-info-grid">
    <button onClick={()=>go('/admin/stages')}><span>Открытые этапы</span><strong>{data.attention.openStages}</strong></button>
    <button onClick={()=>go('/admin/inspections')}><span>Без инспекции</span><strong>{data.attention.pendingInspections}</strong></button>
    <button onClick={()=>go('/admin/results')}><span>Результаты сегодня</span><strong>{data.attention.resultsToday}</strong></button>
   </div>
  </section>
 </PageFrame>
}
function StageMini({title,items,go}:{title:string;items:any[];go:(p:string)=>void}){return <div className="panel"><PanelTitle title={title} icon={CalendarDays} action="Все этапы" onAction={()=>go('/admin/stages')}/>{items.length?items.map(s=><button className="stage-row" key={s.id} onClick={()=>go('/admin/stages')}><div className="stage-number">{s.stageNumber}</div><div className="stage-main"><strong>{s.name}</strong><span>{s.city||'—'} · {formatDate(s.date)}</span></div>{s.registrationOpen!==undefined&&<span className={`status ${s.registrationOpen?'open':''}`}>{s.registrationOpen?'Открыта':'Закрыта'}</span>}<ChevronRight size={16}/></button>):<Empty text="Нет данных"/>}</div>}

type Field={name:string;label:string;type?:string;required?:boolean;options?:string[]};
function ResourcePage({title,subtitle,path,columns,fields,create,update,remove,searchPlaceholder='Поиск'}:{title:string;subtitle:string;path:string;columns:{key:string;label:string}[];fields?:Field[];create?:(v:any)=>Promise<any>;update?:(id:string,v:any)=>Promise<any>;remove?:(id:string)=>Promise<any>;searchPlaceholder?:string}){
 const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[modal,setModal]=useState<any|null>(null),[saving,setSaving]=useState(false);
 const load=()=>{setLoading(true);return apiGet<any>(path).then(r=>setData(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки')).finally(()=>setLoading(false))};useEffect(()=>{void load()},[path]);
 const filtered=data.filter(x=>JSON.stringify(x).toLowerCase().includes(search.toLowerCase()));
 const submit=async(v:any)=>{setSaving(true);try{if(modal?.id&&update)await update(modal.id,v);else if(create)await create(v);setModal(null);await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения')}finally{setSaving(false)}};
 return <PageFrame title={title} subtitle={subtitle} action={<>{fields&&create&&<button className="primary-button compact" onClick={()=>setModal({})}><Plus size={15}/>Добавить</button>}<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/></button></>}><div className="toolbar"><div className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={searchPlaceholder}/></div><span className="row-count">{filtered.length} записей</span></div>{error&&<ErrorPanel message={error} retry={load}/>}<div className="panel table-wrap">{loading?<LoadingPage small/>:<DataTable rows={filtered} columns={columns} onEdit={update?setModal:undefined} onDelete={remove?async id=>{if(confirm('Удалить запись?')){await remove(id);await load()}}:undefined}/>}</div>{modal!==null&&<Modal title={modal.id?'Редактирование':'Новая запись'} onClose={()=>setModal(null)}><EntityForm fields={fields??[]} initial={modal} saving={saving} onSubmit={submit}/></Modal>}</PageFrame>
}

function ParticipantsPage({go}:{go:(p:string)=>void}){return <ResourcePage title="Участники" subtitle="Профили, команды и история выступлений" path="/admin/participants" columns={[{key:'lastName',label:'Фамилия'},{key:'firstName',label:'Имя'},{key:'city',label:'Город'},{key:'team',label:'Команда'},{key:'phone',label:'Телефон'},{key:'isPublic',label:'Публичный'}]} fields={[{name:'lastName',label:'Фамилия',required:true},{name:'firstName',label:'Имя',required:true},{name:'middleName',label:'Отчество'},{name:'city',label:'Город'},{name:'team',label:'Команда'},{name:'phone',label:'Телефон'},{name:'birthDate',label:'Дата рождения',type:'date'}]} create={v=>apiPost('/participants',v)} update={(id,v)=>apiPatch('/participants/'+id,v)} remove={id=>apiDelete('/participants/'+id)} searchPlaceholder="ФИО, город, команда"/>}

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

function SeasonsPage(){return <ResourcePage title="Сезоны" subtitle="Сезонная структура чемпионата" path="/seasons" columns={[{key:'year',label:'Год'},{key:'name',label:'Название'},{key:'status',label:'Статус'},{key:'description',label:'Описание'}]} fields={[{name:'year',label:'Год',type:'number',required:true},{name:'name',label:'Название',required:true},{name:'description',label:'Описание',type:'textarea'}]} create={v=>apiPost('/seasons',v)} update={(id,v)=>apiPatch('/seasons/'+id,v)}/>}

function StagesPage({go}:{go:(p:string)=>void}){return <ResourcePage title="Этапы" subtitle="Календарь соревнований и открытие регистрации" path="/stages" columns={[{key:'stageNumber',label:'#'},{key:'name',label:'Название'},{key:'city',label:'Город'},{key:'date',label:'Дата'},{key:'status',label:'Статус'},{key:'registrationOpen',label:'Регистрация'}]} fields={[{name:'stageNumber',label:'Номер',type:'number',required:true},{name:'name',label:'Название',required:true},{name:'city',label:'Город'},{name:'date',label:'Дата',type:'datetime-local',required:true},{name:'venue',label:'Площадка'},{name:'address',label:'Адрес'},{name:'seasonId',label:'ID сезона'}]} create={v=>apiPost('/stages',v)} update={(id,v)=>apiPatch('/stages/'+id,v)} remove={id=>apiDelete('/stages/'+id)} searchPlaceholder="Название, город"/>}

function ClassesPage(){const[tab,setTab]=useState<'classes'|'directions'>('classes');return <PageFrame title="Классы" subtitle="Направления, классы и единицы измерения" action={<div className="segmented"><button className={tab==='classes'?'selected':''} onClick={()=>setTab('classes')}>Классы</button><button className={tab==='directions'?'selected':''} onClick={()=>setTab('directions')}>Направления</button></div>}>{tab==='classes'?<ResourcePage title="Классы" subtitle="" path="/classes" columns={[{key:'code',label:'Код'},{key:'name',label:'Название'},{key:'direction.name',label:'Направление'},{key:'unit',label:'Единица'},{key:'isActive',label:'Активен'}]} fields={[{name:'directionId',label:'ID направления',required:true},{name:'code',label:'Код',required:true},{name:'name',label:'Название',required:true},{name:'unit',label:'Единица',options:['DB','MPS','OTHER']}]} create={v=>apiPost('/classes',v)} update={(id,v)=>apiPatch('/classes/'+id,v)}/>:<ResourcePage title="Направления" subtitle="" path="/directions" columns={[{key:'name',label:'Название'},{key:'sortOrder',label:'Порядок'},{key:'isActive',label:'Активно'}]} fields={[{name:'name',label:'Название',required:true},{name:'sortOrder',label:'Порядок',type:'number'}]} create={v=>apiPost('/directions',v)} update={(id,v)=>apiPatch('/directions/'+id,v)} remove={id=>apiDelete('/directions/'+id)}/>}</PageFrame>}

function RegistrationsPage(){return <ResourcePage title="Регистрации" subtitle="Регистрации по этапам, автомобилям и классам" path="/registrations" columns={[{key:'participantNumber',label:'№'},{key:'participant.lastName',label:'Участник'},{key:'car.brand',label:'Автомобиль'},{key:'car.model',label:'Модель'},{key:'status',label:'Статус'},{key:'stage.name',label:'Этап'}]} searchPlaceholder="Участник, номер, автомобиль"/>}
function StagePicker({children}:{children:(stageId:string)=>React.ReactNode}){const[stages,setStages]=useState<any[]>([]),[stageId,setStageId]=useState('');useEffect(()=>{apiGet('/stages').then(r=>{const s=listData(r);setStages(s);if(s[0]?.id)setStageId(s[0].id)})},[]);return <><div className="toolbar stage-picker"><label>Этап<select value={stageId} onChange={e=>setStageId(e.target.value)}><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name}</option>)}</select></label></div>{stageId?children(stageId):<div className="panel"><Empty text="Выберите этап"/></div>}</>}
function InspectionsPage(){const[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(false);return <PageFrame title="Инспекции" subtitle="Технический контроль перед результатом"><StagePicker>{stageId=><div className="panel table-wrap">{loading?<LoadingPage small/>:<StageRegistrations stageId={stageId} onRows={setRows} onLoading={setLoading}/>}</div>}</StagePicker></PageFrame>}
function StageRegistrations({stageId,onRows,onLoading}:{stageId:string;onRows:(x:any[])=>void;onLoading:(x:boolean)=>void}){const[rows,setRows]=useState<any[]>([]);useEffect(()=>{let live=true;onLoading(true);apiGet('/registrations?stageId='+encodeURIComponent(stageId)).then(r=>{const regs=listData(r).map((x:any)=>({...x,inspectionStatus:x.inspection?.status??'—'}));if(live){setRows(regs);onRows(regs)}}).catch(()=>{if(live){setRows([]);onRows([])}}).finally(()=>{if(live)onLoading(false)});return()=>{live=false}},[stageId]);return <DataTable rows={rows} columns={[{key:'participantNumber',label:'№'},{key:'participant.lastName',label:'Участник'},{key:'car.brand',label:'Автомобиль'},{key:'car.model',label:'Модель'},{key:'inspectionStatus',label:'Инспекция'},{key:'status',label:'Регистрация'}]}/> }
function ResultsPage(){return <PageFrame title="Результаты" subtitle="Официальные результаты. JUDGE создаёт, ADMIN корректирует."><StagePicker>{stageId=><ResultsStage stageId={stageId}/>}</StagePicker></PageFrame>}
function ResultsStage({stageId}:{stageId:string}){const[data,setData]=useState<any[]>([]),[error,setError]=useState('');useEffect(()=>{apiGet('/results/admin/stage/'+stageId).then(r=>setData(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Ошибка'))},[stageId]);return <>{error&&<div className="notice"><AlertTriangle size={18}/>{error}</div>}<div className="panel table-wrap"><DataTable rows={data} columns={autoColumns(data)}/></div></>}
function DisqualificationsPage(){return <OperationalPage title="Дисквалификации" subtitle="Активные и отозванные дисквалификации" icon={AlertTriangle} endpoint="/disqualifications"/>}
function HistoricalPage(){return <OperationalPage title="История результатов" subtitle="Импорт исторических результатов и верификация" icon={History} endpoint="/historical-results"/>}
function OperationalPage({title,subtitle,icon:Icon,endpoint}:{title:string;subtitle:string;icon:any;endpoint:string}){const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');const load=()=>{setLoading(true);return apiGet<any>(endpoint).then(r=>setData(listData(r))).catch(e=>setError(e instanceof Error?e.message:'Для списка требуется выбранный этап')).finally(()=>setLoading(false))};useEffect(()=>{void load()},[endpoint]);return <PageFrame title={title} subtitle={subtitle} action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>{error&&<div className="notice"><Icon size={18}/><span>{error}</span></div>}<div className="panel table-wrap">{loading?<LoadingPage small/>:<DataTable rows={data} columns={autoColumns(data)}/>}</div></PageFrame>}

function ImportPage(){const[stageId,setStageId]=useState(''),[json,setJson]=useState(''),[result,setResult]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');const preview=async()=>{setLoading(true);setError('');try{const body=JSON.parse(json||'{}');setResult(await apiPost('/imports/stage/preview',{stageId,...body}))}catch(e){setError(e instanceof Error?e.message:'Проверьте JSON')}finally{setLoading(false)}};return <PageFrame title="Импорт" subtitle="Предпросмотр → предупреждения → исправление → commit"><div className="import-grid"><div className="panel form"><label>ID этапа<input value={stageId} onChange={e=>setStageId(e.target.value)} placeholder="UUID"/></label><label>Данные импорта<textarea rows={16} value={json} onChange={e=>setJson(e.target.value)} placeholder={'{"registrations":[],"results":[]}'}/></label><button className="primary-button" disabled={loading||!stageId} onClick={()=>void preview()}>{loading?'Проверяем…':'Запустить preview'}</button>{error&&<div className="form-error"><AlertTriangle size={16}/>{error}</div>}</div><div className="panel"><PanelTitle title="Результат проверки" icon={FileInput}/>{result?<pre className="json-view">{JSON.stringify(result,null,2)}</pre>:<Empty text="Здесь появятся строки READY / WARNING"/>}</div></div></PageFrame>}

function RecordsPage(){return <OperationalPage title="Рекорды" subtitle="Текущие и исторические рекорды" icon={Trophy} endpoint="/records/admin/current"/>}
function StatisticsPage(){const[overview,setOverview]=useState<any>(null),[participants,setParticipants]=useState<any[]>([]);useEffect(()=>{Promise.all([apiGet('/statistics/overview'),apiGet('/statistics/participants?limit=50')]).then(([o,p])=>{setOverview(o);setParticipants(listData(p))})},[]);return <PageFrame title="Статистика" subtitle="Участники, посещения, места и лучшие результаты"><div className="kpi-grid small">{overview&&Object.entries(overview.overview??overview).slice(0,6).map(([k,v])=><div className="stat-card" key={k}><span>{humanize(k)}</span><strong>{String(v)}</strong></div>)}</div><div className="panel table-wrap"><DataTable rows={participants} columns={autoColumns(participants)}/></div></PageFrame>}
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

function Coming({title,icon:Icon,user}:{title:string;icon:any;user:User}){return <PageFrame title={title} subtitle={user.role==='JUDGE'?'Раздел доступен в режиме судьи':'Управление разделом USD 2.0'}><div className="panel feature-placeholder"><div className="placeholder-icon"><Icon size={28}/></div><h2>Раздел готовится</h2><p>Каркас подключён. Интерфейс будет расширяться поверх реального API без изменения серверных прав.</p></div></PageFrame>}

function PageFrame({title,subtitle,children,action}:{title:string;subtitle:string;children:React.ReactNode;action?:React.ReactNode}){return <div className="page"><div className="page-heading"><div><div className="eyebrow">USD 2.0</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>{children}</div>}
function PanelTitle({title,icon:Icon,action,onAction}:{title:string;icon:any;action?:string;onAction?:()=>void}){return <div className="panel-title"><div><Icon size={17}/><h2>{title}</h2></div>{action&&<button className="text-button" onClick={onAction}>{action}<ChevronRight size={14}/></button>}</div>}
function DataTable({rows,columns,onEdit,onDelete}:{rows:any[];columns:{key:string;label:string}[];onEdit?:(row:any)=>void;onDelete?:(id:string)=>void}){if(!rows.length)return <Empty text="Записей пока нет"/>;return <table className="data-table"><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}{(onEdit||onDelete)&&<th/>}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id??i}>{columns.map(c=><td key={c.key}>{formatCell(getPath(r,c.key))}</td>)}{(onEdit||onDelete)&&<td className="row-actions">{onEdit&&<button className="icon-button" onClick={()=>onEdit(r)} title="Изменить">✎</button>}{onDelete&&r.id&&<button className="icon-button danger" onClick={()=>void onDelete(r.id)} title="Удалить">×</button>}</td>}</tr>)}</tbody></table>}
function autoColumns(rows:any[]){const first=rows[0]??{};return Object.keys(first).filter(k=>!['id','createdAt','updatedAt','deletedAt'].includes(k)&&typeof first[k]!=='object').slice(0,8).map(k=>({key:k,label:humanize(k)}))}
function getPath(o:any,path:string){return path.split('.').reduce((a,k)=>a?.[k],o)}
function formatCell(v:any){if(v===null||v===undefined)return '—';if(typeof v==='boolean')return v?<span className="badge good"><Check size={11}/>Да</span>:<span className="badge">Нет</span>;if(typeof v==='string'&&v.includes('T')&&!Number.isNaN(Date.parse(v)))return formatDate(v);return String(v)}
function humanize(s:string){return s.replace(/([A-Z])/g,' $1').replace(/[_-]/g,' ').replace(/^./,x=>x.toUpperCase())}
function EntityForm({fields,initial,saving,onSubmit}:{fields:Field[];initial:any;saving:boolean;onSubmit:(v:any)=>Promise<void>}){const[v,setV]=useState<any>(initial??{});return <form className="form modal-form" onSubmit={e=>{e.preventDefault();void onSubmit(clean(v))}}>{fields.map(f=><label key={f.name}>{f.label}{f.options?<select value={v[f.name]??''} onChange={e=>setV({...v,[f.name]:e.target.value})}><option value="">—</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>:f.type==='textarea'?<textarea rows={4} value={v[f.name]??''} onChange={e=>setV({...v,[f.name]:e.target.value})}/>:<input type={f.type??'text'} value={v[f.name]??''} onChange={e=>setV({...v,[f.name]:f.type==='number'?Number(e.target.value):e.target.value})} required={f.required}/>}</label>)}<button className="primary-button" disabled={saving}>{saving?<><Loader2 className="spin" size={15}/>Сохраняем…</>:'Сохранить'}</button></form>}
function clean(v:any){return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==''&&x!==undefined))}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><div className="modal-head"><strong>{title}</strong><button className="icon-button" onClick={onClose}><X size={17}/></button></div>{children}</div></div>}
function LoadingPage({small=false}:{small?:boolean}){return <div className={small?'loading-small':'loading-page'}><Loader2 className="spin"/><span>Загрузка…</span></div>}
function ErrorPanel({message,retry}:{message:string;retry:()=>Promise<any>|any}){return <div className="error-panel"><AlertTriangle/><div><strong>Не удалось загрузить данные</strong><p>{message}</p><button className="text-button" onClick={()=>void retry()}>Повторить</button></div></div>}
function Empty({text}:{text:string}){return <div className="empty-state"><Activity size={20}/><span>{text}</span></div>}
function formatDate(v:string){return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(v))}
export default App;
