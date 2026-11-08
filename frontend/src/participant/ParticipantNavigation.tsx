import {CarFront,ClipboardCheck,LayoutDashboard,UserRound,Users} from 'lucide-react';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import InternalLink from '../navigation/InternalLink';
export type ParticipantTab='overview'|'profile'|'cars'|'registrations'|'team';
export function participantTab(path:string):ParticipantTab{
 const query=new URLSearchParams(path.split('?')[1]??'').get('tab');
 if(query==='profile'||query==='cars'||query==='registrations'||query==='team')return query;
 return 'overview';
}
export default function ParticipantNavigation({tab,go}:{tab:ParticipantTab;go:(path:string)=>void}){
 const [mobile,setMobile]=useState(()=>typeof window!=='undefined'&&!!window.matchMedia?.('(max-width:760px)').matches);
 useEffect(()=>{const query=window.matchMedia?.('(max-width:760px)');if(!query)return;const sync=()=>setMobile(query.matches);sync();query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync)},[]);
 const items=[['overview','Обзор',LayoutDashboard],['profile','Профиль',UserRound],['cars','Мои автомобили',CarFront],['registrations','Регистрации',ClipboardCheck],['team','Команда',Users]] as const;
 const navigation=<nav className="participant-tabs participant-tabs-with-team" aria-label="Разделы личного кабинета">{items.map(([key,label,Icon])=><InternalLink key={key} href={'/participant?tab='+key} go={go} className={tab===key?'active':''} aria-current={tab===key?'page':undefined}><Icon size={19} aria-hidden="true"/><span>{label}</span></InternalLink>)}</nav>;
 return mobile?createPortal(navigation,document.body):navigation;
}
