import {useEffect,useState} from 'react';
import {ShieldCheck,QrCode,ArrowUpRight} from 'lucide-react';
import {apiGet,type User} from '../api';
import {hasAdminPanelAccess} from '../navigation/accountAccess';

type PublicProfile={id:string;firstName?:string;lastName?:string;middleName?:string;team?:string;city?:string;registrations?:unknown[]};
/** QR landing is safe for public sharing: private profiles never leak personal data. */
export default function UsdIdLanding({token,user,go}:{token:string;user?:User|null;go:(path:string)=>void}){
 const [profile,setProfile]=useState<PublicProfile|null>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);setProfile(null);void apiGet<PublicProfile>('/participants/usd-id/'+encodeURIComponent(token)).then(p=>{if(active)setProfile(p)}).catch(()=>{}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[token]);
 const target='/admin/inspections?usdId='+encodeURIComponent(token);
 const inspector=hasAdminPanelAccess(user)?target:'/login?next='+encodeURIComponent(target);
 return <section className="u-panel usd-id-public-landing" style={{padding:'clamp(22px,5vw,44px)',maxWidth:720,display:'grid',gap:16}}>
  <div style={{display:'flex',gap:12,alignItems:'center',color:'#fff'}}><QrCode size={28} color="#f0475f"/><strong>ЦИФРОВАЯ КАРТОЧКА USD</strong></div>
  {loading?<p role="status">Проверяем публичную карточку участника…</p>:profile?<div><h2 style={{color:'#fff',fontSize:'clamp(24px,5vw,38px)',margin:'0 0 8px'}}>{[profile.firstName,profile.lastName].filter(Boolean).join(' ')}</h2><p>{[profile.city,profile.team].filter(Boolean).join(' · ')||'Участник USD'}</p><button type="button" className="u-btn u-quiet" onClick={()=>go('/participants/'+encodeURIComponent(profile.id))}>Открыть публичный профиль ↗</button></div>:<p>Публичный профиль недоступен. Участник мог скрыть его или перевыпустить USD ID.</p>}
  <p><ShieldCheck size={17} style={{verticalAlign:'middle',color:'#f0475f'}}/> Судья может найти активную регистрацию и статус допуска в закрытой панели инспекции. Контактные данные в QR не записываются.</p>
  <button type="button" className="u-btn" onClick={()=>go(inspector)}>Открыть инспекцию <ArrowUpRight size={16}/></button>
  <small>USD ID не является пропуском и не заменяет проверку судьи.</small>
 </section>;
}
