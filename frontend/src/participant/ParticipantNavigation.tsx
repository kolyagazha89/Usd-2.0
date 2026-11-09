import {CarFront,ClipboardCheck,LayoutDashboard,UserRound,Users} from 'lucide-react';
import {useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import InternalLink from '../navigation/InternalLink';
export type ParticipantTab='overview'|'profile'|'cars'|'registrations'|'team';
export function participantTab(path:string):ParticipantTab{
 const query=new URLSearchParams(path.split('?')[1]??'').get('tab');
 if(query==='profile'||query==='cars'||query==='registrations'||query==='team')return query;
 return 'overview';
}
const mobileQuery='(max-width:760px)';
const isMobileViewport=()=>typeof window!=='undefined'&&Boolean(window.matchMedia?.(mobileQuery).matches);
const subscribeToViewport=(notify:()=>void)=>{
 if(typeof window==='undefined'||!window.matchMedia)return()=>{};
 const media=window.matchMedia(mobileQuery);
 media.addEventListener('change',notify);
 return()=>media.removeEventListener('change',notify);
};
export default function ParticipantNavigation({tab,go}:{tab:ParticipantTab;go:(path:string)=>void}){
 // The first render must already choose the final portal destination.
 // A delayed effect can move the dock from content to body after paint on iOS.
 const mobile=useSyncExternalStore(subscribeToViewport,isMobileViewport,()=>false);
 const items=[['overview','Обзор',LayoutDashboard],['profile','Профиль',UserRound],['cars','Мои автомобили',CarFront],['registrations','Регистрации',ClipboardCheck],['team','Команда',Users]] as const;
 const navigation=<nav className="participant-tabs participant-tabs-with-team" aria-label="Разделы личного кабинета">{items.map(([key,label,Icon])=><InternalLink key={key} href={'/participant?tab='+key} go={go} className={tab===key?'active':''} aria-current={tab===key?'page':undefined}><Icon size={19} aria-hidden="true"/><span>{label}</span></InternalLink>)}</nav>;
 return mobile?createPortal(navigation,document.body):navigation;
}
