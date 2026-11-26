import {useEffect,useRef} from 'react';
import {useViewState} from './view-state';

const BATCH_SIZE=10;
export function useIncrementalRows<T>(viewKey:string,rows:readonly T[],filterKey:string){
 const [stored,setStored]=useViewState(viewKey+':visibleCount',BATCH_SIZE);
 const signature=viewKey+'\0'+filterKey,previous=useRef(signature);
 const limit=previous.current===signature?Math.max(BATCH_SIZE,Number(stored)||BATCH_SIZE):BATCH_SIZE;
 useEffect(()=>{if(previous.current!==signature){previous.current=signature;setStored(BATCH_SIZE)}},[signature,setStored]);
 return {rows:rows.slice(0,limit),showMore:()=>setStored(count=>Math.min(rows.length,Math.max(BATCH_SIZE,count)+BATCH_SIZE))};
}

export function AdminLoadMore({label,total,shown,onMore,busy=false}:{label:string;total:number;shown:number;onMore:()=>void;busy?:boolean}){
 if(total<=BATCH_SIZE)return null;
 return <div className="admin-load-more">
  <span role="status">{shown<total?`Показаны ${shown} из ${total}`:`Показаны все: ${total}`}</span>
  {shown<total&&<button type="button" className="secondary-button" aria-label={'Загрузить ещё: '+label} disabled={busy} onClick={onMore}>{busy?'Загрузка…':'Загрузить ещё'}</button>}
 </div>;
}
