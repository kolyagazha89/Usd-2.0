import {ArrowDown,ArrowUp,RotateCcw} from 'lucide-react';
import {DEFAULT_PUBLIC_NAVIGATION,editablePublicNavigationItems,type PublicMenuItem} from '../public/navigation-model';
import './navigation-settings.css';

type Props={navigation:any;onChange:(value:any)=>void};
export default function NavigationSettings({navigation,onChange}:Props){
 const rows=editablePublicNavigationItems(navigation);
 const publish=(next:PublicMenuItem[])=>onChange({...navigation,items:next.map((item,index)=>({...item,sortOrder:index}))});
 const edit=(index:number,change:Partial<PublicMenuItem>)=>publish(rows.map((item,i)=>i===index?{...item,...change}:item));
 const move=(from:number,to:number)=>{
  if(to<0||to>=rows.length)return;
  const next=[...rows];const [item]=next.splice(from,1);next.splice(to,0,item);publish(next);
 };
 return <div className="settings-section">
  <div className="settings-navigation-heading"><div><h2>Меню сайта</h2><p className="settings-help">Переименовывайте и скрывайте разделы, меняйте порядок. Ссылки выбираются только из существующих страниц USD. Изменения появятся в публичном меню после нажатия «Сохранить всё».</p></div>
   <button type="button" className="secondary-button compact" onClick={()=>publish(DEFAULT_PUBLIC_NAVIGATION.map(item=>({...item})))}><RotateCcw size={15}/>Сбросить порядок и названия</button></div>
  <div className="settings-navigation-list" role="group" aria-label="Пункты меню">
   {rows.map((item,index)=><div className="settings-navigation-row" key={item.path}>
    <label className="settings-navigation-toggle"><input type="checkbox" checked={item.enabled} onChange={event=>edit(index,{enabled:event.target.checked})}/><span className="sr-only">Показывать {item.label}</span></label>
    <div className="settings-navigation-fields"><label>Название<input type="text" maxLength={48} value={item.label} onChange={event=>edit(index,{label:event.target.value})} aria-label={'Название пункта '+item.path}/></label><small>{item.path}</small></div>
    <div className="settings-navigation-order"><button type="button" className="icon-button" disabled={index===0} onClick={()=>move(index,index-1)} aria-label={'Поднять '+item.label}><ArrowUp size={17}/></button><button type="button" className="icon-button" disabled={index===rows.length-1} onClick={()=>move(index,index+1)} aria-label={'Опустить '+item.label}><ArrowDown size={17}/></button></div>
   </div>)}
  </div>
  <div className="settings-navigation-preview"><strong>Предпросмотр публичного меню</strong><nav aria-label="Предпросмотр меню">{rows.filter(item=>item.enabled).map(item=><span key={item.path}>{item.label||'Без названия'}</span>)}{!rows.some(item=>item.enabled)&&<em>Все пункты скрыты — логотип и вход в кабинет останутся доступны.</em>}</nav></div>
 </div>;
}
