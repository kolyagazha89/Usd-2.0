import {useEffect,useState} from 'react';
import {AlertTriangle,BarChart3,Bell,Bot,CalendarDays,CarFront,ChevronRight,ClipboardCheck,Database,FileClock,FileInput,Flag, Gauge,History,Layers,LayoutDashboard,LockKeyhole,LogOut,Mail,Menu,Package,Settings2,ShieldAlert,Trophy,UserRound,Users,X} from 'lucide-react';
import {getPublicSiteAsset,type Role,type User} from '../api';

const nav=[
 {section:'Рабочий стол',label:'Панель управления',path:'/admin',icon:LayoutDashboard,roles:['ADMIN','JUDGE']},

 // Оперативная работа на этапах
 {section:'Соревнования',label:'Этапы',path:'/admin/stages',icon:Flag,roles:['ADMIN','JUDGE']},
 {section:'Соревнования',label:'Регистрации',path:'/admin/registrations',icon:ClipboardCheck,roles:['ADMIN','JUDGE']},
 {section:'Соревнования',label:'Инспекции',path:'/admin/inspections',icon:ShieldAlert,roles:['ADMIN','JUDGE']},
 {section:'Соревнования',label:'Результаты',path:'/admin/results',icon:Trophy,roles:['ADMIN','JUDGE']},

 // Люди, команды и автомобили
 {section:'Участники и автопарк',label:'Участники',path:'/admin/participants',icon:Users,roles:['ADMIN']},
 {section:'Участники и автопарк',label:'Команды',path:'/admin/teams',icon:Users,roles:['ADMIN']},
 {section:'Участники и автопарк',label:'Автомобили',path:'/admin/cars',icon:CarFront,roles:['ADMIN']},

 // Итоги, рекорды и спортивный контроль
 {section:'Результаты и контроль',label:'Рекорды',path:'/admin/records',icon:Trophy,roles:['ADMIN','JUDGE']},
 {section:'Результаты и контроль',label:'Статистика',path:'/admin/statistics',icon:BarChart3,roles:['ADMIN','JUDGE']},
 {section:'Результаты и контроль',label:'Дисквалификации',path:'/admin/disqualifications',icon:AlertTriangle,roles:['ADMIN']},

 // Публичные материалы сайта
 {section:'Контент сайта',label:'Новости',path:'/admin/news',icon:Bell,roles:['ADMIN']},
 {section:'Контент сайта',label:'Партнёры',path:'/admin/partners',icon:Users,roles:['ADMIN']},
 {section:'Контент сайта',label:'Регламент и правила',path:'/admin/rules',icon:FileClock,roles:['ADMIN']},
 {section:'Контент сайта',label:'Юридические документы',path:'/admin/legal-documents',icon:FileClock,roles:['ADMIN']},

 // Справочники, используемые в регистрации и каталоге
 {section:'Справочники',label:'Сезоны',path:'/admin/seasons',icon:CalendarDays,roles:['ADMIN']},
 {section:'Справочники',label:'Классы',path:'/admin/classes',icon:Gauge,roles:['ADMIN']},
 {section:'Справочники',label:'Виброизоляция',path:'/admin/vibration',icon:Layers,roles:['ADMIN']},
 {section:'Справочники',label:'Комплектующие',path:'/admin/components',icon:Package,roles:['ADMIN']},

 // Импорт, история и качество данных
 {section:'Импорт и данные',label:'Импорт',path:'/admin/import',icon:FileInput,roles:['ADMIN']},
 {section:'Импорт и данные',label:'История результатов',path:'/admin/historical-results',icon:History,roles:['ADMIN']},
 {section:'Импорт и данные',label:'Контроль данных',path:'/admin/data-quality',icon:Database,roles:['ADMIN']},

 // Доступы, настройки и системные инструменты
 {section:'Система',label:'Пользователи и доступы',path:'/admin/users',icon:UserRound,roles:['ADMIN']},
 {section:'Система',label:'Медиатека',path:'/admin/media',icon:Layers,roles:['ADMIN']},
 {section:'Система',label:'Роли и права',path:'/admin/roles',icon:LockKeyhole,roles:['ADMIN']},
 {section:'Система',label:'Аудит действий',path:'/admin/audit',icon:FileClock,roles:['ADMIN']},
 {section:'Система',label:'Тестирование писем',path:'/admin/email-testing',icon:Mail,roles:['ADMIN']},
 {section:'Система',label:'Настройки сайта',path:'/admin/site-settings',icon:Settings2,roles:['ADMIN']},
 {section:'Система',label:'Ассистент USD',path:'/admin/assistant',icon:Bot,roles:['ADMIN']},
 ];
function navPermissionModule(path:string):string {
 if(path==='/admin')return 'statistics';
 if(path.startsWith('/admin/stages'))return 'stages';
 if(path.startsWith('/admin/registrations'))return 'registrations';
 if(path.startsWith('/admin/inspections'))return 'inspections';
 if(path.startsWith('/admin/results'))return 'results';
 if(path.startsWith('/admin/records'))return 'records';
 if(path.startsWith('/admin/participants'))return 'participants';
 if(path.startsWith('/admin/teams'))return 'teams';
 if(path.startsWith('/admin/cars'))return 'cars';
 if(path.startsWith('/admin/seasons'))return 'seasons';
 if(path.startsWith('/admin/classes'))return 'classes';
 if(path.startsWith('/admin/disqualifications'))return 'disqualifications';
 if(path.startsWith('/admin/statistics'))return 'statistics';
 if(path.startsWith('/admin/import'))return 'imports';
 if(path.startsWith('/admin/historical-results'))return 'historicalResults';
 if(path.startsWith('/admin/data-quality')||path.startsWith('/admin/audit'))return 'statistics';
 if(path.startsWith('/admin/media'))return 'media';
 if(path.startsWith('/admin/assistant'))return 'assistant';
 if(path.startsWith('/admin/google'))return 'integrations';
 if(path.startsWith('/admin/email-testing'))return 'siteSettings';
 if(path.startsWith('/admin/legal-documents')||path.startsWith('/admin/site-settings')||path.startsWith('/admin/partners')||path.startsWith('/admin/news')||path.startsWith('/admin/rules')||path.startsWith('/admin/vibration')||path.startsWith('/admin/components'))return 'siteSettings';
 return '';
}

const BRAND_LOGO_CACHE='usd_brand_logo';
function readBrandLogo(){try{return localStorage.getItem(BRAND_LOGO_CACHE)??''}catch{return''}}

export function AdminShell({user,path,go,mobileOpen,setMobileOpen,onLogout,PageContent,roleName,cacheBrandLogo}:{user:User;path:string;go:(p:string)=>void;mobileOpen:boolean;setMobileOpen:(v:boolean)=>void;onLogout:()=>Promise<void>;PageContent:React.ComponentType<any>;roleName:Record<Role,string>;cacheBrandLogo:(url:string)=>void}){
 const routePath=path.split('?')[0];
 const[logo,setLogo]=useState(readBrandLogo());
 useEffect(()=>{let active=true;getPublicSiteAsset('branding-logoUrl').then(r=>{if(!active||!r?.url)return;cacheBrandLogo(r.url);setLogo(r.url);}).catch(()=>{});return()=>{active=false}},[]);
 const visibleNav=nav.filter(x=>{if(user.role==='ADMIN')return true;if(user.customRoleId){const module=navPermissionModule(x.path);return Boolean(module&&user.customRole?.permissions?.[module]?.includes('view'))}return x.roles.includes(user.role)});
 const sections=[...new Set(visibleNav.map(x=>x.section))];
 const [openSections,setOpenSections]=useState<Record<string,boolean>>(()=>{try{return JSON.parse(localStorage.getItem('usd_sidebar_sections')||'{}')}catch{return{}}});
 useEffect(()=>{const active=visibleNav.find(x=>x.path===routePath)||visibleNav.find(x=>x.path!=='/admin'&&routePath.startsWith(x.path+'/'));if(active&&!openSections[active.section])setOpenSections(s=>({...s,[active.section]:true}))},[path,visibleNav.length]);
 const toggleSection=(section:string)=>setOpenSections(s=>{const next={...s,[section]:!(s[section]??true)};try{localStorage.setItem('usd_sidebar_sections',JSON.stringify(next))}catch{}return next});
 return <div className="app-shell">
  <aside className={`sidebar ${mobileOpen?'open':''}`}>
   <div className="sidebar-top">
    <button className="brand-button" onClick={()=>go('/admin')} aria-label="USD 2.0">
     <span className="brand-mark small">{logo?<img className="brand-logo-shell" src={logo} alt="USD"/>:<span>USD</span>}</span>
     <span className="brand-title">USD <b>2.0</b></span>
    </button>
    <button className="icon-button mobile-close" onClick={()=>setMobileOpen(false)} aria-label="Закрыть меню"><X size={18}/></button>
   </div>
   <nav>{sections.map(section=>{const isOpen=openSections[section]??true;return <div key={section} className="sidebar-section"><button className="sidebar-label sidebar-section-toggle" onClick={()=>toggleSection(section)} aria-expanded={isOpen}><span>{section}</span><ChevronRight size={14} className={isOpen?'section-chevron open':''}/></button>{isOpen&&visibleNav.filter(x=>x.section===section).map(item=>{const Icon=item.icon;const active=routePath===item.path||(item.path!=='/admin'&&routePath.startsWith(item.path+'/'));return <button key={item.path} className={`nav-item ${active?'active':''}`} onClick={()=>go(item.path)}><Icon size={17}/><span>{item.label}</span></button>})}</div>})}</nav>
   <div className="sidebar-bottom">
    <div className="user-mini"><span className="avatar">{(user.email||'U').slice(0,1).toUpperCase()}</span><div><strong>{roleName[user.role]}</strong><small>{user.email}</small></div></div>
    <button className="logout-button" onClick={()=>void onLogout()}><LogOut size={15}/>Выйти</button>
   </div>
  </aside>
  {mobileOpen&&<button className="mobile-backdrop" aria-label="Закрыть меню" onClick={()=>setMobileOpen(false)}/>}
  <div className="main">
   <header className="topbar">
    <button className="icon-button menu-button" onClick={()=>setMobileOpen(true)} aria-label="Меню"><Menu size={19}/></button>
    <div className="breadcrumb"><strong>USD 2.0</strong><span>/</span><span>{visibleNav.find(x=>x.path===routePath)?.label??'Панель управления'}</span></div>
    <div className="topbar-actions"><span className="role-pill">{roleName[user.role]}</span><button className="icon-button" onClick={()=>void onLogout()} title="Выйти"><LogOut size={17}/></button></div>
   </header>
   <main className="content"><PageContent path={path} go={go} user={user}/></main>
  </div>
 </div>;
}

export default AdminShell;
