import {useEffect,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Home,CalendarDays,BarChart3,UserRound,Trophy,Users,Newspaper,BookOpen,Handshake,Car,Info,Phone,FileText} from 'lucide-react';
import PublicNavigation from '../navigation/PublicNavigation';
import {hasAdminPanelAccess} from '../navigation/accountAccess';
import {Link,PremiumNavigation,PremiumPlaceholders,type PhotoPlaceholders} from './PremiumUI';
import type {User} from '../api';
import {canonicalForRoute,openGraphImageUrl,publicImageAssetUrl,socialTitleForRoute} from './metadata-model';
import {footerPublicNavigationGroups,mobileDockNavigationItems} from './navigation-model';
const DOCK_ICONS:Record<string,typeof Home>={'/':Home,'/stages':CalendarDays,'/results':BarChart3,'/records':Trophy,'/participants':UserRound,'/teams':Users,'/news':Newspaper,'/rules':BookOpen,'/documents':FileText,'/partners':Handshake,'/cars':Car,'/about':Info,'/contacts':Phone};
const dockRouteActive=(route:string,path:string)=>route===path||(path!=='/'&&route.startsWith(path+'/'));

export function PremiumHeader({route,go,user,items,settings}:{route:string;go:(p:string)=>void;user?:User|null;items:string[][];settings:any}){
 const account=user?'/participant':'/login';
 const adminPath=hasAdminPanelAccess(user)?'/admin':undefined;
 const logo=publicImageAssetUrl(settings?.branding?.logoUrl,location.origin,'/usd/usd-original.png');
 const mobileLogo=settings?.branding?.mobileLogoUrl?publicImageAssetUrl(settings.branding.mobileLogoUrl,location.origin,'/usd/usd-original.png'):'';
 return <><a className="u-skip" href="#public-content" onClick={e=>{e.preventDefault();document.getElementById('public-content')?.focus();document.getElementById('public-content')?.scrollIntoView()}}>Перейти к содержимому</a><header className="u-header p-public-header"><div className="u-container u-header-inner"><Link className="u-brand" to="/" aria-label="USD — главная"><picture>{mobileLogo&&<source media="(max-width: 680px)" srcSet={mobileLogo}/>}<img className="u-logo" src={logo} alt={settings?.branding?.siteName||"USD"} width="529" height="474"/></picture></Link>{adminPath&&<Link to="/admin" className="usd-header-admin-shortcut" aria-label="Перейти в админ-панель">Панель ↗</Link>}<PublicNavigation items={items} route={route} go={go} accountPath={account} accountLabel="Личный кабинет" adminPath={adminPath}/></div></header></>;
}
export function PremiumFooter({settings,user,route='/'}:{settings:any;user?:User|null;route?:string}){
 const year=new Date().getFullYear(),account=user?'/participant':'/login',admin=hasAdminPanelAccess(user);
 const logo=publicImageAssetUrl(settings?.branding?.logoUrl,location.origin,'/usd/usd-original.png');
 const footerLinks=footerPublicNavigationGroups(settings?.navigation);
 const dockItems=mobileDockNavigationItems(settings?.navigation);
 return <><footer className="u-footer"><div className="u-container"><div className="u-footer-top"><div><img className="u-logo" src={logo} alt={settings?.branding?.siteName||"USD"} width="529" height="474"/><h3>{settings.footer?.text||<>У каждого звука<br/>есть своя история.</>}</h3><p>{settings.footer?.description||'Начни свою на следующем этапе USD.'}</p></div><div><small>СОРЕВНОВАНИЯ</small>{footerLinks.competitions.map(([r,n])=><Link to={r} key={r}>{n}</Link>)}</div><div><small>СООБЩЕСТВО</small>{footerLinks.community.map(([r,n])=><Link to={r} key={r}>{n}</Link>)}</div><div><small>ИНФОРМАЦИЯ</small>{footerLinks.information.map(([r,n])=><Link to={r} key={r}>{n}</Link>)}{[['/privacy','Конфиденциальность'],['/terms','Условия использования'],['/consent','Обработка данных']].map(([r,n])=><Link to={r} key={r}>{n}</Link>)}</div></div><div className="u-footer-bottom"><span>© {year} {settings.footer?.copyright||settings.legal?.copyrightHolder||'USD · Ultimate Sound Destruction'}</span>{settings.legal?.ipName&&<span>{settings.legal.ipName}{settings.legal.inn?' · ИНН '+settings.legal.inn:''}{settings.legal.ogrnip?' · ОГРНИП '+settings.legal.ogrnip:''}</span>}<span className="usd-footer-account-links"><Link to={account}>Личный кабинет ↗</Link>{admin&&<Link to="/admin">Админ-панель ↗</Link>}</span></div></div></footer>{createPortal(<nav className="u-mobile-dock" style={{'--usd-dock-columns':dockItems.length+1} as CSSProperties} aria-label="Быстрые переходы">{dockItems.map(([path,label])=>{const Icon=DOCK_ICONS[path]??Home;const active=dockRouteActive(route,path);return <Link to={path} key={path} className={active?'active':''} aria-current={active?'page':undefined}><Icon size={22} strokeWidth={1.5}/><span title={label}>{label}</span></Link>})}<Link to={account} className={dockRouteActive(route,account)?'active':''} aria-current={dockRouteActive(route,account)?'page':undefined}><UserRound size={22} strokeWidth={1.5}/><span>Кабинет</span></Link></nav>,document.body)}</>;
}
export function PremiumProvider({go,children,placeholders}:{go:(p:string)=>void;children:ReactNode;placeholders?:PhotoPlaceholders}){return <PremiumNavigation.Provider value={go}><PremiumPlaceholders.Provider value={placeholders??{}}>{children}</PremiumPlaceholders.Provider></PremiumNavigation.Provider>}
export function PublicMetadata({path,settings,title}:{path:string;settings:any;title:string}){
 useEffect(()=>{
  const text=path==='/'?(settings.seo?.title||'USD — Ultimate Sound Destruction'):title+' — USD';document.title=text;
  const description=settings.seo?.description||'Чемпионат USD по автозвуку: этапы, результаты, рекорды и сообщество участников.';
  const set=(name:string,content:string,property=false)=>{let el=document.querySelector<HTMLMetaElement>(`meta[${property?'property':'name'}="${name}"]`);if(!el){el=document.createElement('meta');el.setAttribute(property?'property':'name',name);document.head.append(el)}el.content=content};
  set('description',description);set('og:title',socialTitleForRoute(path,text,settings.seo?.ogTitle),true);set('og:description',settings.seo?.ogDescription||description,true);set('og:type','website',true);set('og:image',openGraphImageUrl(settings.seo?.ogImage,location.origin),true);
  set('keywords',settings.seo?.keywords||'');
  let icon=document.querySelector<HTMLLinkElement>('link[rel="icon"]');if(!icon){icon=document.createElement('link');icon.rel='icon';document.head.append(icon)}icon.href=publicImageAssetUrl(settings.branding?.faviconUrl,location.origin,'/favicon.ico');
  let canonical=document.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical)}canonical.href=canonicalForRoute(path,settings.seo?.canonical,location.origin);set('og:url',canonical.href,true);
 },[path,settings.seo?.title,settings.seo?.description,settings.seo?.ogTitle,settings.seo?.ogDescription,settings.seo?.ogImage,settings.seo?.canonical,settings.seo?.keywords,settings.branding?.faviconUrl,title]);return null;
}
