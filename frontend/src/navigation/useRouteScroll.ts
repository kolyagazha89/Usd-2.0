import {useCallback,useLayoutEffect,useRef} from 'react';
import {readViewState,restoreScroll} from '../admin/view-state';
import {liveRoutePath,routeScrollKey,routeScrollTarget} from './route-scroll-model';

export function useRouteScroll(path:string){
 const intent=useRef<'initial'|'push'|'pop'>('initial');
 const currentPath=useRef(path);currentPath.current=path;
 const save=useCallback(()=>{
  const top=window.scrollY;
  try{sessionStorage.setItem('usd:view:route-scroll:'+routeScrollKey(liveRoutePath(currentPath.current,window.location)),JSON.stringify(top))}catch{}
  history.replaceState({...history.state,usdScrollY:top},'',location.href);
 },[]);
 const beforeNavigate=useCallback(()=>{save();intent.current='push'},[save]);
 const onHistoryNavigation=useCallback(()=>{intent.current='pop'},[]);
 useLayoutEffect(()=>{
  const previous=history.scrollRestoration;history.scrollRestoration='manual';
  return()=>{history.scrollRestoration=previous};
 },[]);
 const screen=routeScrollKey(path);
 useLayoutEffect(()=>{
  const top=routeScrollTarget(path,intent.current,readViewState('route-scroll:'+screen,0),history.state?.usdScrollY);
  intent.current='push';
  const stop=restoreScroll(top);
  // Do not replace a saved destination with a clamped interim position while
  // the incoming screen is still loading its rows, images or lazy module.
  const remember=()=>{if(Math.abs(window.scrollY-top)<2)save()};
  const userControl=()=>{window.removeEventListener('scroll',remember);window.addEventListener('scroll',save)};
  window.addEventListener('scroll',remember);
  for(const event of ['wheel','touchstart','pointerdown','keydown'])window.addEventListener(event,userControl,{once:true});
  return()=>{stop();window.removeEventListener('scroll',remember);window.removeEventListener('scroll',save);for(const event of ['wheel','touchstart','pointerdown','keydown'])window.removeEventListener(event,userControl)};
 },[screen]);
 return {beforeNavigate,onHistoryNavigation};
}
