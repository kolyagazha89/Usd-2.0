import {Bell,KeyRound,Smartphone,UserRound} from 'lucide-react';
import InternalLink from '../navigation/InternalLink';
import './profile-navigation.css';

export type ParticipantProfileSection='personal'|'security'|'sessions'|'notifications';

export function participantProfileSection(path:string):ParticipantProfileSection {
 const selected=new URLSearchParams(path.split('?')[1]??'').get('section');
 if(selected==='security'||selected==='sessions'||selected==='notifications')return selected;
 return 'personal';
}

const sections=[
 {id:'personal' as const,title:'Личные данные',description:'ФИО, фото, телефон',icon:UserRound},
 {id:'security' as const,title:'Безопасность',description:'Пароль и почта',icon:KeyRound},
 {id:'sessions' as const,title:'Сеансы',description:'Мои устройства',icon:Smartphone},
 {id:'notifications' as const,title:'Уведомления',description:'Новости и PUSH',icon:Bell},
];

export default function ParticipantProfileNavigation({section,go}:{section:ParticipantProfileSection;go:(path:string)=>void}){
 return <nav className="participant-profile-nav" aria-label="Настройки профиля USD">
  {sections.map(({id,title,description,icon:Icon})=><InternalLink key={id} href={'/participant?tab=profile&section='+id} go={go} className={'participant-profile-nav-item'+(section===id?' is-active':'')} aria-current={section===id?'page':undefined}>
   <span className="participant-profile-nav-icon"><Icon size={21} aria-hidden="true"/></span>
   <span className="participant-profile-nav-label"><strong>{title}</strong><small>{description}</small></span>
  </InternalLink>)}
 </nav>;
}
