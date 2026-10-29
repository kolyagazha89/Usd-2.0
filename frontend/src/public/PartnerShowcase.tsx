import {Link,Photo} from './PremiumUI';
import {safeHref} from './premium-model';
import {visiblePartners,type PublicPartner} from './partner-model';

type Tier = 'GENERAL' | 'PREMIUM' | 'REGULAR';
type Partner=PublicPartner;
const TIERS:{id:Tier;heading:string;badge:string}[]=[
 {id:'GENERAL',heading:'Генеральный партнёр',badge:'ГЕНЕРАЛЬНЫЙ ПАРТНЁР'},
 {id:'PREMIUM',heading:'Премиальные партнёры',badge:'ПРЕМИАЛЬНЫЙ ПАРТНЁР'},
 {id:'REGULAR',heading:'Партнёры чемпионата',badge:'ПАРТНЁР USD'},
];
const normalizeTier=(tier:unknown):Tier=>tier==='GENERAL'||tier==='PREMIUM'?tier:'REGULAR';
const displayName=(partner:Partner)=>String(partner.name??'').trim()||'Партнёр USD';

function PartnerCard({partner,tier,compact}:{partner:Partner;tier:Tier;compact:boolean}){
 const name=displayName(partner),href=safeHref(partner.website);
 const external=/^https?:\/\//i.test(href);
 const photo=<Photo src={partner.photoUrl??undefined} alt={name} className="p-partner-logo" fallback={name}/>;
 return <article className={'usd-partner-card usd-partner-card--'+tier.toLowerCase()+' u-panel'}>
  <span className="usd-partner-badge">{TIERS.find(t=>t.id===tier)?.badge}</span>
  {external?<a className="usd-partner-visual" href={href} target="_blank" rel="noopener noreferrer" aria-label={'Сайт партнёра '+name}>{photo}</a>:compact?<Link className="usd-partner-visual" to="/partners" aria-label={'Подробнее о партнёре '+name}>{photo}</Link>:<div className="usd-partner-visual">{photo}</div>}
  <div className="usd-partner-info"><h3>{name}</h3>{!compact&&partner.description&&<p>{partner.description}</p>}
  {external?<a className="usd-partner-link" href={href} target="_blank" rel="noopener noreferrer">Сайт партнёра ↗</a>:compact?<Link className="usd-partner-link" to="/partners">Подробнее ↗</Link>:null}</div>
 </article>;
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
    <div className="usd-partner-grid">{items.map((p,i)=><PartnerCard key={p.id??tier.id+'-'+i} partner={p} tier={tier.id} compact={compact}/>)}</div>
   </section>;
  })}
 </div>;
}
