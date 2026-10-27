import {useEffect} from 'react';

/**
 * Route-independent progressive motion for USD.
 *
 * Uses the browser's native animation API so that content stays visible when
 * JavaScript, IntersectionObserver, or motion preferences prevent animation.
 * The observer never changes business state or modifies interactive controls.
 */
export default function VelocityEffects(){
 useEffect(()=>{
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const progress=document.querySelector<HTMLElement>('.usd-scroll-progress');
  let frame=0;
  const updateProgress=()=>{
   frame=0;
   if(!progress)return;
   const max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
   const value=max>0?Math.min(1,Math.max(0,window.scrollY/max)):0;
   progress.style.transform='scaleX('+value.toFixed(4)+')';
  };
  const onScroll=()=>{if(!frame)frame=window.requestAnimationFrame(updateProgress)};
  onScroll();
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll);

  const seen=new WeakSet<Element>();
  const selectors=[
   '.usd-live .u-next-event',
   '.usd-live .u-home-dashboard > .u-panel',
   '.usd-live .u-value-grid > a',
   '.usd-live .p-news-card',
   '.usd-live .public-stage-card',
   '.usd-live .public-result-card',
   '.usd-live .public-record-card',
   '.usd-live .p-person-card',
   '.usd-live .p-team-card',
   '.usd-live .p-car-card',
   '.usd-member .participant-section',
   '.usd-member .participant-car-card',
   '.usd-member .registration-card',
   '.usd-member .participant-journey li',
   '.app-shell .content > .page > .panel'
  ].join(',');
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(!entry.isIntersecting)continue;
    observer.unobserve(entry.target);
    const element=entry.target as HTMLElement;
    if(reduce?.matches||!element.animate)continue;
    element.animate([
     {opacity:.74,transform:'translate3d(0,18px,0)'},
     {opacity:1,transform:'translate3d(0,0,0)'}
    ],{duration:520,easing:'cubic-bezier(.2,.7,.2,1)',iterations:1});
   }
  },{threshold:.07,rootMargin:'0px 0px -16px 0px'}):null;

  const scan=()=>{
   for(const element of document.querySelectorAll<HTMLElement>(selectors)){
    if(seen.has(element))continue;
    seen.add(element);
    observer?.observe(element);
   }
  };
  let scanFrame=0;
  const scheduleScan=()=>{
   if(scanFrame)return;
   scanFrame=requestAnimationFrame(()=>{scanFrame=0;scan();onScroll()});
  };
  scan();
  const root=document.getElementById('root');
  const mutations=root?new MutationObserver(scheduleScan):null;
  if(root)mutations?.observe(root,{childList:true,subtree:true});
  return()=>{
   window.removeEventListener('scroll',onScroll);
   window.removeEventListener('resize',onScroll);
   if(frame)cancelAnimationFrame(frame);
   if(scanFrame)cancelAnimationFrame(scanFrame);
   mutations?.disconnect();
   observer?.disconnect();
  };
 },[]);
 return <div className="usd-scroll-progress" aria-hidden="true"/>;
}
