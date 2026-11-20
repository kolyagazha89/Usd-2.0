import {useEffect,useRef,useState,type ReactNode} from 'react';
import './catalog-workspace.css';
/** Both panes stay level on desktop; opening a brand replaces the list on phones. */
export function CatalogWorkspace({selection,resetKey,pageKey,children}:{selection:string;resetKey?:string;pageKey?:number;children:ReactNode[]}){
 const [pane,setPane]=useState<'brands'|'models'>('brands');
 const models=useRef<HTMLDivElement>(null);
 useEffect(()=>{setPane(selection?'models':'brands');models.current?.querySelector('.catalog-list')?.scrollTo?.({top:0})},[selection]);
 useEffect(()=>setPane('brands'),[resetKey]);
 useEffect(()=>{models.current?.querySelector('.catalog-list')?.scrollTo?.({top:0})},[pageKey]);
 return <div className="catalog-workspace">
  <nav className="catalog-pane-switch" aria-label="Разделы справочника"><button type="button" className="secondary-button compact" aria-pressed={pane==='brands'} onClick={()=>setPane('brands')}>Марки</button><button type="button" className="secondary-button compact" aria-pressed={pane==='models'} onClick={()=>setPane('models')}>Модели{selection?' · '+selection:''}</button></nav>
  <div className="catalog-two-column" data-pane={pane}>
   <div className="catalog-workspace-pane catalog-brands-pane" onClickCapture={event=>{if((event.target as HTMLElement).closest('.catalog-list-select'))setPane('models')}}>{children[0]}</div>
   <div ref={models} className="catalog-workspace-pane catalog-models-pane">{children[1]}</div>
  </div>
 </div>;
}
