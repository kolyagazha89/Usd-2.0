import {createContext,useContext,type ReactNode} from 'react';
import {adminEntityPath,relatedAdminEntities,safeAdminReturn,type AdminEntityKind} from './entity-navigation';

export const AdminNavigationContext=createContext<{go:(path:string)=>void;path:string}|null>(null);
export function AdminEntityLink({kind,id,children}:{kind:AdminEntityKind;id:unknown;children:ReactNode}){
 const navigation=useContext(AdminNavigationContext);
 const destination=adminEntityPath(kind,id);
 if(!navigation||!destination)return <>{children}</>;
 const from=safeAdminReturn(navigation.path);
 const href=destination+(from?(destination.includes('?')?'&':'?')+'returnTo='+encodeURIComponent(from):'');
 return <a className="admin-entity-link" href={href} onClick={event=>{
  event.stopPropagation();
  if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigation.go(href)}
 }} onKeyDown={event=>event.stopPropagation()}>{children}</a>;
}
export function AdminRelatedEntities({item}:{item:any}){
 const links=relatedAdminEntities(item);
 if(!links.length)return null;
 return <nav className="admin-related-entities" aria-label="Связанные карточки">{links.map(link=><span key={link.kind+link.id}><small>{{car:'Автомобиль',stage:'Этап',participant:'Участник'}[link.kind]}</small><AdminEntityLink kind={link.kind} id={link.id}>{link.label}</AdminEntityLink></span>)}</nav>;
}
export function AdminReturnLink(){
 const navigation=useContext(AdminNavigationContext);
 const from=navigation?safeAdminReturn(new URLSearchParams(navigation.path.split('?')[1]??'').get('returnTo')):null;
 return from&&navigation?<a className="admin-entity-link admin-return-link" href={from} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigation.go(from)}}}>← Вернуться к исходной карточке</a>:null;
}
