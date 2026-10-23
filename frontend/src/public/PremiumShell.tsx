import {useEffect,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Home,CalendarDays,BarChart3,UserRound} from 'lucide-react';
import PublicNavigation from '../navigation/PublicNavigation';
import {hasAdminPanelAccess} from '../navigation/accountAccess';
import {Link,PremiumNavigation,PremiumPlaceholders,type PhotoPlaceholders} from './PremiumUI';
import type {User} from '../api';
import {mobileDockTop} from '../navigation/mobileDockViewport';
const sections=[['/stages','Этапы'],['/results','Результаты'],['/records','Рекорды'],['/participants','Участники'],['/teams','Команды'],['/news','Новости'],['/rules','Правила'],['/documents','Документы']];
export function PremiumHeader({route,go,user,items}:{route:string;go:(p:string)=>void;user?:User|null;items:string[][]}){
 const account=user?'/participant':'/login';
 const adminPath=hasAdminPanelAccess(user)?'/admin':undefined;
 return <><a className="u-skip" href="#public-content" onClick={e=>{e.preventDefault();document.getElementById('public-content')?.focus();document.getElementById('public-content')?.scrollIntoView()}}>Перейти к содержимому</a><header className="u-header p-public-header"><div className="u-container u-header-inner"><Link className="u-brand" to="/" aria-label="USD — главная"><img className="u-logo" src="/usd/usd-original.png" alt="USD — Ultimate Sound Destruction" width="529" height="474"/></Link>{adminPath&&<Link to="/admin" className="usd-header-admin-shortcut" aria-label="Перейти в админ-панель">Панель ↗</Link>}<PublicNavigation items={items} route={route} go={go} accountPath={account} accountLabel="Личный кабинет" adminPath={adminPath}/></div></header></>;
}
export function PremiumFooter({settings,user,route='/'}:{settings:any;user?:User|null;route?:string}){
 const year=new Date().getFullYear(),account=user?'/participant':'/login',admin=hasAdminPanelAccess(user);
 useEffect(()=>{
  const dock=document.querySelector<HTMLElement>('body > .u-mobile-dock');
  if(!dock)return;
  const viewport=window.visualViewport;
  let frame=0;
  const sync=()=>{
   cancelAnimationFrame(frame);
   frame=requestAnimationFrame(()=>{
    if(window.innerWidth>740){dock.style.removeProperty('--usd-dock-visual-top');dock.style.removeProperty('visibility');return;}
    // iOS 26 WebKit sometimes paints bottom:0 against the wrong viewport.
    // Anchor the top edge to the actual VisualViewport bottom instead.
    const bottom=viewport?viewport.offsetTop+viewport.height:window.innerHeight;
    dock.style.setProperty('--usd-dock-visual-top',mobileDockTop(bottom,dock.offsetHeight)+'px');
    const editing=document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')??false;
    const keyboardVisible=Boolean(viewport&&window.innerHeight-viewport.height>120);
    dock.style.visibility=editing&&keyboardVisible?'hidden':'';
   });
  };
  sync();
  window.addEventListener('resize',sync);
  window.addEventListener('orientationchange',sync);
  window.addEventListener('pageshow',sync);
  document.addEventListener('focusin',sync);
  document.addEventListener('focusout',sync);
  viewport?.addEventListener('resize',sync);
  viewport?.addEventListener('scroll',sync);
  return()=>{
   cancelAnimationFrame(frame);
   window.removeEventListener('resize',sync);
   window.removeEventListener('orientationchange',sync);
   window.removeEventListener('pageshow',sync);
   document.removeEventListener('focusin',sync);
   document.removeEventListener('focusout',sync);
   viewport?.removeEventListener('resize',sync);
   viewport?.removeEventListener('scroll',sync);
   dock.style.removeProperty('--usd-dock-visual-top');
   dock.style.removeProperty('visibility');
  };
 },[]);
 return <><footer className="u-footer"><div className="u-container"><div className="u-footer-top"><div><img className="u-logo" src="/usd/usd-original.png" alt="USD" width="529" height="474"/><h3>У каждого звука<br/>есть своя история.</h3><p>{settings.footer?.description||'Начни свою на следующем этапе USD.'}</p></div><div><small>СОРЕВНОВАНИЯ</small>{sections.slice(0,4).map(([r,n])=><Link to={r} key={r}>{n}</Link>)}</div><div><small>СООБЩЕСТВО</small>{[['/teams','Команды'],['/cars','Автомобили'],['/news','Журнал'],['/partners','Партнёры'],['/contacts','Контакты']].map(([r,n])=><Link to={r} key={r}>{n}</Link>)}</div><div><small>ИНФОРМАЦИЯ</small>{[['/about','О чемпионате'],['/rules','Регламент'],['/documents','Документы'],['/privacy','Конфиденциальность'],['/terms','Условия использования'],['/consent','Обработка данных']].map(([r,n])=><Link to={r} key={r}>{n}</Link>)}</div></div><div className="u-footer-bottom"><span>© {year} {settings.legal?.copyrightHolder||'USD · Ultimate Sound Destruction'}</span>{settings.legal?.ipName&&<span>{settings.legal.ipName}{settings.legal.inn?' · ИНН '+settings.legal.inn:''}{settings.legal.ogrnip?' · ОГРНИП '+settings.legal.ogrnip:''}</span>}<span className="usd-footer-account-links"><Link to={account}>Личный кабинет ↗</Link>{admin&&<Link to="/admin">Админ-панель ↗</Link>}</span></div></div></footer>{createPortal(<nav className="u-mobile-dock" aria-label="Быстрые переходы">{[[Home,'/','Главная'],[CalendarDays,'/stages','Этапы'],[BarChart3,'/results','Результаты'],[UserRound,account,'Кабинет']].map(([Icon,path,label]:any)=><Link to={path} key={path} className={(path==='/'?route===path:route===path||route.startsWith(path+'/'))?'active':''} aria-current={(path==='/'?route===path:route===path||route.startsWith(path+'/'))?'page':undefined}><Icon size={22} strokeWidth={1.5}/><span>{label}</span></Link>)}</nav>,document.body)}</>;
}
export function PremiumProvider({go,children,placeholders}:{go:(p:string)=>void;children:ReactNode;placeholders?:PhotoPlaceholders}){return <PremiumNavigation.Provider value={go}><PremiumPlaceholders.Provider value={placeholders??{}}>{children}</PremiumPlaceholders.Provider></PremiumNavigation.Provider>}
export function PublicMetadata({path,settings,title}:{path:string;settings:any;title:string}){
 useEffect(()=>{
  const text=path==='/'?(settings.seo?.title||'USD — Ultimate Sound Destruction'):title+' — USD';document.title=text;
  const description=settings.seo?.description||'Чемпионат USD по автозвуку: этапы, результаты, рекорды и сообщество участников.';
  const set=(name:string,content:string,property=false)=>{let el=document.querySelector<HTMLMetaElement>(`meta[${property?'property':'name'}="${name}"]`);if(!el){el=document.createElement('meta');el.setAttribute(property?'property':'name',name);document.head.append(el)}el.content=content};
  set('description',description);set('og:title',text,true);set('og:description',description,true);set('og:type','website',true);set('og:image',location.origin+'/usd/usd-show-hero.webp',true);
  let canonical=document.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical)}canonical.href=location.origin+path;set('og:url',canonical.href,true);
 },[path,settings.seo?.title,settings.seo?.description,title]);return null;
}
