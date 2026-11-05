import {useEffect,useState} from 'react';

/** Touch screens use the USD on-screen alphabet instead of a full OS keyboard.
 * Desktop users keep physical typing, paste and normal keyboard shortcuts.
 */
export function useCoarsePointer():boolean {
 const [coarse,setCoarse]=useState(false);
 useEffect(()=>{
  if(typeof window.matchMedia!=='function')return;
  const query=window.matchMedia('(pointer: coarse)');
  const update=()=>setCoarse(query.matches);
  update();
  query.addEventListener?.('change',update);
  return()=>query.removeEventListener?.('change',update);
 },[]);
 return coarse;
}

export function useNativePlateKeyboard(country:string):boolean {
 const coarse=useCoarsePointer();
 return country!=='RU'||!coarse;
}
