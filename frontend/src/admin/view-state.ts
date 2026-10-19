import {useCallback,useEffect,useLayoutEffect,useState} from 'react';

export function readViewState<T>(key:string,fallback:T):T {
 try {const raw=sessionStorage.getItem('usd:view:'+key);return raw===null?fallback:JSON.parse(raw)} catch {return fallback}
}
export function useViewState<T>(key:string,fallback:T) {
 const [entry,setEntry]=useState<{key:string;value:T}>(()=>({key,value:readViewState(key,fallback)}));
 const value=entry.key===key?entry.value:readViewState(key,fallback);
 const setValue=useCallback((next:T|((previous:T)=>T))=>setEntry(previous=>{
   const current=previous.key===key?previous.value:readViewState(key,fallback);
   return {key,value:typeof next==='function'?(next as (previous:T)=>T)(current):next};
 }),[key]);
 useEffect(()=>{try{sessionStorage.setItem('usd:view:'+key,JSON.stringify(value))}catch{}},[key,value]);
 return [value,setValue] as const;
}
export function stageYear(stage:any):string {
 const year=stage?.season?.year??(stage?.date?new Date(stage.date).getFullYear():null);
 return year&&Number.isFinite(Number(year))?String(year):'';
}
export function seasonYears(stages:any[]):string[] {return [...new Set(stages.map(stageYear).filter(Boolean))].sort((a,b)=>Number(b)-Number(a))}
export function matchesSeason(stage:any,season:string):boolean {return season==='ALL'||stageYear(stage)===season}

// Keep the requested position while asynchronous lists regain their height.
// Stop restoring as soon as the user takes control of scrolling.
export function restoreScroll(top:number) {
 let frame=0;
 const apply=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>window.scrollTo({top,behavior:'instant'}))};
 const observer=new ResizeObserver(apply);
 const stop=()=>{observer.disconnect();cancelAnimationFrame(frame);for(const event of ['wheel','touchstart','pointerdown','keydown'])window.removeEventListener(event,stop)};
 observer.observe(document.body);apply();
 for(const event of ['wheel','touchstart','pointerdown','keydown'])window.addEventListener(event,stop,{once:true});
 return stop;
}
export function useListScroll(key:string,active:boolean,ready:boolean) {
 useLayoutEffect(()=>{
  if(!active||!ready)return;
  const stop=restoreScroll(readViewState<number>('scroll:'+key,0));
  const save=()=>{try{sessionStorage.setItem('usd:view:scroll:'+key,JSON.stringify(window.scrollY))}catch{}};
  window.addEventListener('scroll',save);
  return()=>{stop();window.removeEventListener('scroll',save)};
 },[key,active,ready]);
}
