import {CarFront,ClipboardCheck,LayoutDashboard,UserRound} from 'lucide-react';
import InternalLink from '../navigation/InternalLink';
export type ParticipantTab='overview'|'profile'|'cars'|'registrations';
export function participantTab(path:string):ParticipantTab{
 const query=new URLSearchParams(path.split('?')[1]??'').get('tab');
 if(query==='profile'||query==='cars'||query==='registrations')return query;
 return 'overview';
}
export default function ParticipantNavigation({tab,go}:{tab:ParticipantTab;go:(path:string)=>void}){
 const items=[['overview','Обзор',LayoutDashboard],['profile','Профиль',UserRound],['cars','Мои автомобили',CarFront],['registrations','Регистрации',ClipboardCheck]] as const;
 return <nav className="participant-tabs" aria-label="Разделы личного кабинета">{items.map(([key,label,Icon])=><InternalLink key={key} href={'/participant?tab='+key} go={go} className={tab===key?'active':''} aria-current={tab===key?'page':undefined}><Icon size={19} aria-hidden="true"/><span>{label}</span></InternalLink>)}</nav>;
}
