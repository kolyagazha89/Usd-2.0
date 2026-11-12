import {createContext,useContext,useState,type ReactNode} from 'react';
import {adminEntityPath,relatedAdminEntities,safeAdminReturn,type AdminEntityKind} from './entity-navigation';

export const AdminNavigationContext=createContext<{go:(path:string)=>void;path:string}|null>(null);
// Store the selected card in its URL so returning from another section or
// reloading does not silently reopen the parent list instead of that card.
export function useAdminDetail(items:any[]){
 const navigation=useContext(AdminNavigationContext);
 const [local,setLocal]=useState<any|null>(null);
 const params=new URLSearchParams(navigation?.path.split('?')[1]??'');
 const view=params.get('view');
 const detail=navigation?(view?items.find(item=>item.id===view)??null:null):local;
 const setDetail=(item:any|null)=>{
  if(!navigation){setLocal(item);return}
  if(item)params.set('view',item.id);else params.delete('view');
  const next=navigation.path.split('?')[0]+(params.size?'?'+params.toString():'');
  if(next!==navigation.path)navigation.go(next);
 };
 return [detail,setDetail] as const;
}
export function AdminEntityLink({kind,id,children}:{kind:AdminEntityKind;id:unknown;children:ReactNode}){
 const destination=adminEntityPath(kind,id);
 return destination?<AdminRouteLink to={destination}>{children}</AdminRouteLink>:<>{children}</>;
}
export function AdminRouteLink({to,children}:{to:string;children:ReactNode}){
 const navigation=useContext(AdminNavigationContext);
 const destination=safeAdminReturn(to);
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
