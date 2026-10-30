import type {ReactNode} from 'react';
import type {ParticipantTab} from './ParticipantNavigation';
const copy={
 overview:{title:'Мой USD',description:'Ваша система. Ваши старты. Ваша история.'},
 profile:{title:'Мой профиль',description:'Контактные данные, фотография и настройки видимости.'},
 cars:{title:'Мои автомобили',description:'Добавьте автомобиль и сохраните оборудование, с которым выступаете.'},
 team:{title:'Моя команда',description:'Текущий состав, заявки и материалы вашей команды.'},
 registrations:{title:'Мои регистрации',description:'Заявки на этапы, номера участников, QR-коды и результаты.'},
} as const;
export default function ParticipantIntro({tab,name,children}:{tab:ParticipantTab;name?:string;children?:ReactNode}){
 const page=copy[tab];
 return <div className="participant-welcome participant-page-intro"><div><span className="eyebrow">USD / УЧАСТНИК{name?' / '+name:''}</span><h1>{page.title}</h1><p>{page.description}</p></div>{children}</div>;
}
