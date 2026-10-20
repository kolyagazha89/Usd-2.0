import {useEffect,useId,useRef,useState} from 'react';
import {ArrowUpRight,Menu,X} from 'lucide-react';
import InternalLink from './InternalLink';
export default function PublicNavigation({items,route,go,accountPath='/login',accountLabel='Войти'}:{items:string[][];route:string;go:(path:string)=>void;accountPath?:string;accountLabel?:string}){
 const[open,setOpen]=useState(false);const id=useId();const nav=useRef<HTMLElement>(null);const toggle=useRef<HTMLButtonElement>(null);
 useEffect(()=>setOpen(false),[route]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!nav.current?.contains(event.target as Node))setOpen(false)};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);toggle.current?.focus()}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
 },[open]);
 return <nav ref={nav} className="public-nav" aria-label="Основная навигация">
  <button ref={toggle} type="button" className="public-nav-toggle" aria-label={open?'Закрыть меню':'Открыть меню'} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>{open?<X size={21}/>:<Menu size={21}/>}</button>
  <div id={id} className="public-nav-links" data-open={open}>{items.map(([href,label])=><InternalLink key={href} href={href} go={go} onNavigate={()=>setOpen(false)} aria-current={route===href?'page':undefined}>{label}</InternalLink>)}
   <InternalLink className="public-nav-login" href={accountPath} go={go} onNavigate={()=>setOpen(false)}>{accountLabel}<ArrowUpRight size={16} aria-hidden="true"/></InternalLink>
  </div>
 </nav>;
}
