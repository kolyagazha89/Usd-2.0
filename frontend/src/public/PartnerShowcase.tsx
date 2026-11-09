import {useEffect,useId,useRef,useState} from 'react';
import {Link} from './PremiumUI';
import {safeHref} from './premium-model';
import {partnerDescriptionPreview,visiblePartners,type PublicPartner} from './partner-model';
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

function PartnerDescription({description}:{description:string}){
 const [expanded,setExpanded]=useState(false);
 const id=useId();
 const full=String(description).trim();
 const preview=partnerDescriptionPreview(full,170);
 if(!full)return null;
 return <div className="usd-partner-description">
  <p id={id}>{expanded?full:preview.text}{preview.truncated&&!expanded?'…':null}</p>
  {preview.truncated&&<button type="button" className="usd-partner-expand" aria-expanded={expanded}
    aria-controls={id} onClick={()=>setExpanded(value=>!value)}>
    {expanded?'Свернуть':'Читать далее'} <span aria-hidden="true">{expanded?'↑':'↓'}</span>
  </button>}
 </div>;
}

function PartnerCard({partner,tier,compact}:{partner:Partner;tier:Tier;compact:boolean}){
 const name=displayName(partner),href=safeHref(partner.website);
 const external=/^https?:\/\//i.test(href);
 const configured=partner.imageLayout!==undefined;
 const visualClass='usd-partner-visual usd-partner-visual--managed'+(configured?' usd-partner-visual--configured':'');
 const photo=<PartnerImage src={partner.photoUrl} name={name} tier={tier} layout={partner.imageLayout}/>;
 return <article className={'usd-partner-card usd-partner-card--'+tier.toLowerCase()+' u-panel'}>
  <span className="usd-partner-badge">{TIERS.find(t=>t.id===tier)?.badge}</span>
  {external?<a className={visualClass} href={href} target="_blank" rel="noopener noreferrer" aria-label={'Сайт партнёра '+name}>{photo}</a>:compact?<Link className={visualClass} to="/partners" aria-label={'Подробнее о партнёре '+name}>{photo}</Link>:<div className={visualClass}>{photo}</div>}
  <div className="usd-partner-info"><h3>{name}</h3>{!compact&&partner.description&&<PartnerDescription description={partner.description}/>}
  {external?<a className="usd-partner-link" href={href} target="_blank" rel="noopener noreferrer">Сайт партнёра ↗</a>:compact?<Link className="usd-partner-link" to="/partners">Подробнее ↗</Link>:null}</div>
 </article>;
}

/** Homepage only: an automatically advancing, swipeable rail with equal-size cards.
 * Manual swiping, keyboard focus and reduced-motion preferences stop automatic movement.
 */
function HomePartnerCarousel({items,tier}:{items:Partner[];tier:'REGULAR'|'STUDIO'}){
 const rail=useRef<HTMLDivElement>(null);
 const manuallyPaused=useRef(false);
 const [current,setCurrent]=useState(0);
 useEffect(()=>{
  const el=rail.current;
  if(!el||items.length<2||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const timer=window.setInterval(()=>{
   if(manuallyPaused.current||document.hidden||el.scrollWidth<=el.clientWidth+2)return;
   const cards=Array.from(el.children) as HTMLElement[];
   const first=cards[0]?.offsetLeft??0;
   const closest=cards.reduce((best,card,index)=>
    Math.abs(card.offsetLeft-first-el.scrollLeft)<Math.abs(cards[best].offsetLeft-first-el.scrollLeft)?index:best,0);
   const next=(closest+1)%cards.length;
   el.scrollTo({left:cards[next].offsetLeft-first,behavior:'smooth'});
  },4600);
  return()=>window.clearInterval(timer);
 },[items.length]);
 const onScroll=()=>{
  const el=rail.current;
  if(!el)return;
  const first=(el.firstElementChild as HTMLElement|null)?.offsetLeft??0;
  const closest=Array.from(el.children).reduce((best,child,index,children)=>{
   const distance=Math.abs((child as HTMLElement).offsetLeft-first-el.scrollLeft);
   const previous=Math.abs((children[best] as HTMLElement).offsetLeft-first-el.scrollLeft);
   return distance<previous?index:best;
  },0);
  setCurrent(closest);
 };
 return <div className="usd-partner-carousel-wrap">
  <div ref={rail} className="usd-partner-carousel" role="region" aria-roledescription="карусель"
   aria-label={tier==='STUDIO'?'Студии-партнёры':'Обычные партнёры чемпионата'} tabIndex={0} onScroll={onScroll}
   onPointerDown={()=>{manuallyPaused.current=true}} onWheel={()=>{manuallyPaused.current=true}}
   onFocusCapture={()=>{manuallyPaused.current=true}} onMouseEnter={()=>{manuallyPaused.current=true}}>
   {items.map((partner,index)=><PartnerCard key={partner.id??tier+'-'+index} partner={partner} tier={tier} compact/>)}
  </div>
  {items.length>1&&<div className="usd-partner-carousel-meta" aria-hidden="true">
   <span>Листайте партнёров</span><span>{String(current+1).padStart(2,'0')} / {String(items.length).padStart(2,'0')}</span>
  </div>}
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
    {compact&&(tier.id==='REGULAR'||tier.id==='STUDIO')?<HomePartnerCarousel items={items} tier={tier.id}/>: 
     <div className="usd-partner-grid">{items.map((p,i)=><PartnerCard key={p.id??tier.id+'-'+i} partner={p} tier={tier.id} compact={compact}/>)}</div>}
   </section>;
  })}
 </div>;
}
