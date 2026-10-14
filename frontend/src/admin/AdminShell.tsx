import {useEffect,useState} from 'react';
import {ChevronRight,LogOut,Menu,X} from 'lucide-react';
import type {ReactNode} from 'react';
import type {User} from '../api';
import {getPublicSiteAsset} from '../api';
import {adminNavigation,navPermissionModule,roleName} from './navigation';

type Props = {user:User;path:string;go:(p:string)=>void;mobileOpen:boolean;setMobileOpen:(v:boolean)=>void;onLogout:()=>Promise<void>;content:ReactNode};
const BRAND_LOGO_CACHE='usd_brand_logo';
function readBrandLogo(){try{return localStorage.getItem(BRAND_LOGO_CACHE)??''}catch{return''}}
function cacheBrandLogo(url:string){try{localStorage.setItem(BRAND_LOGO_CACHE,url)}catch{}}

export function AdminShell({user,path,go,mobileOpen,setMobileOpen,onLogout,content}:Props){
 const routePath=path.split('?')[0];
 const[logo,setLogo]=useState(readBrandLogo());
 useEffect(()=>{let active=true;getPublicSiteAsset('branding-logoUrl').then(r=>{if(!active||!r?.url)return;cacheBrandLogo(r.url);setLogo(r.url);}).catch(()=>{});return()=>{active=false}},[]);
 const visibleNav=adminNavigation.filter(x=>{if(user.role==='ADMIN')return true;if(user.customRoleId){const module=navPermissionModule(x.path);return Boolean(module&&user.customRole?.permissions?.[module]?.includes('view'))}return x.roles.includes(user.role)});
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
   <main className="content">{content}</main>
  </div>
 </div>;
}
