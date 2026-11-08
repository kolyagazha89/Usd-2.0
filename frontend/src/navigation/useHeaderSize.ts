import {useLayoutEffect,useRef} from 'react';
import {observeHeaderSize} from './header-size';

export function useHeaderSize(property: string){
 const ref=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{
  if(ref.current)return observeHeaderSize(ref.current,property);
 },[property]);
 return ref;
}
