import {useEffect,useRef,useState} from 'react';
import {Link} from './PremiumUI';
import {shortPartnerDescription} from './partner-description';
import {safeHref} from './premium-model';
import {visiblePartners,type PublicPartner} from './partner-model';
import PartnerImage from './PartnerImage';

type Tier = 'GENERAL' | 'PREMIUM' | 'REGULAR' | 'STUDIO';
type Partner=PublicPartner;
const TIERS:{id:Tier;heading:string;badge:string}[]=[
 {id:'GENERAL',heading:'Генеральный партнёр',badge:'ГЕНЕРАЛЬНЫЙ ПАРТНЁР'},
 {id:'PREMIUM',heading:'Премиальные партнёры',badge:'ПРЕМИАЛЬНЫЙ ПАРТНЁР'},
 {id:'REGULAR',heading:'Партнёры чемпионата',badge:'ПАРТНЁР USD'},
 {id:'STUDIO',heading:'Студии-партнёры',badge:'СТУДИЯ-ПАРТНЁР'},
];
const normalizeTier=(tier:unknown):Tier=>tier==='GENERAL'||tier==='PREMIUM'||tier==='STUDIO'?tier:'REGULAR';
const displayName=(partner:Partner)=>String(partner.name??'').trim()||'Партнёр USD';

function PartnerCard({partner,tier,compact}:{partner:Partner;tier:Tier;compact:boolean}){
 const [expanded,setExpanded]=useState(false);
 const name=displayName(partner),href=safeHref(partner.website);
 const preview=shortPartnerDescription(partner.description??'');
 const external=/^https?:\/\//i.test(href);
 const configured=partner.imageLayout!==undefined;
 const visualClass='usd-partner-visual usd-partner-visual--managed'+(configured?' usd-partner-visual--configured':'');
 const photo=<PartnerImage src={partner.photoUrl} name={name} tier={tier} layout={partner.imageLayout}/>;
 return <article className={'usd-partner-card usd-partner-card--'+tier.toLowerCase()+' u-panel'}>
  <span className="usd-partner-badge">{TIERS.find(t=>t.id===tier)?.badge}</span>
  {external?<a className={visualClass} href={href} target="_blank" rel="noopener noreferrer" aria-label={'Сайт партнёра '+name}>{photo}</a>:compact?<Link className={visualClass} to="/partners" aria-label={'Подробнее о партнёре '+name}>{photo}</Link>:<div className={visualClass}>{photo}</div>}
  <div className="usd-partner-info"><h3>{name}</h3>{!compact&&partner.description&&<div className="usd-partner-description"><p>{expanded?partner.description:preview.text}</p>{preview.truncated&&<button type="button" className="usd-partner-read-more" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Свернуть':'Читать далее'}</button>}</div>}
  {external?<a className="usd-partner-link" href={href} target="_blank" rel="noopener noreferrer">Сайт партнёра ↗</a>:compact?<Link className="usd-partner-link" to="/partners">Подробнее ↗</Link>:null}</div>
 </article>;
}

/** Swipeable, keyboard-accessible carousel. It pauses automatic motion for interactions. */
function PartnerCarousel({items,tier}:{items:Partner[];tier:Tier}){
 const ref=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{
  const node=ref.current;
  if(!node||items.length<2||typeof window==='undefined')return;
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  let pauseUntil=0;
  const pause=()=>{pauseUntil=Date.now()+10000};
  node.addEventListener('pointerdown',pause,{passive:true});
  node.addEventListener('wheel',pause,{passive:true});
  const timer=window.setInterval(()=>{
   if(document.hidden||Date.now()<pauseUntil||node.matches(':hover')||node.matches(':focus-within'))return;
   if(node.scrollWidth<=node.clientWidth+4)return;
   const first=node.firstElementChild as HTMLElement|null;
   if(!first)return;
   const gap=Number.parseFloat(window.getComputedStyle(node).columnGap)||0;
   const advance=first.getBoundingClientRect().width+gap;
   const end=node.scrollWidth-node.clientWidth;
   node.scrollTo({left:node.scrollLeft+advance>=end-3?0:Math.min(end,node.scrollLeft+advance),behavior:'smooth'});
  },4400);
  return()=>{window.clearInterval(timer);node.removeEventListener('pointerdown',pause);node.removeEventListener('wheel',pause)};
 },[items.length]);
 return <div ref={ref} className="usd-partner-grid usd-partner-carousel" role="region" aria-label="Карусель партнёров чемпионата" tabIndex={0}>
  {items.map((partner,index)=><PartnerCard key={partner.id??tier+'-'+index} partner={partner} tier={tier} compact={true}/>)}
 </div>;
}

export default function PartnerShowcase({partners,variant='full'}:{partners:Partner[];variant?:'home'|'full'}){
 const visible=visiblePartners(partners);
 const compact=variant==='home';
 return <div className={'usd-partner-showcase usd-partner-showcase--'+variant}>
  {TIERS.map(tier=>{
   const items=visible.filter(p=>normalizeTier(p.tier)===tier.id);
   if(!items.length)return null;
   return <section className={'usd-partner-tier usd-partner-tier--'+tier.id.toLowerCase()} key={tier.id} aria-label={tier.heading}>
    <div className="usd-partner-tier-heading"><span aria-hidden="true"/><h2>{tier.heading}</h2><span className="usd-partner-tier-count">{String(items.length).padStart(2,'0')}</span></div>
    {compact&&tier.id==='REGULAR'?<PartnerCarousel items={items} tier={tier.id}/>:<div className="usd-partner-grid">{items.map((p,i)=><PartnerCard key={p.id??tier.id+'-'+i} partner={p} tier={tier.id} compact={compact}/>)}</div>}
   </section>;
  })}
 </div>;
}
