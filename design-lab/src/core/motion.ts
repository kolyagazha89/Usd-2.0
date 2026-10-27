import { useLayoutEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

export function useReveal(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(()=>{
    const root=ref.current;
    if(!root) return;
    const media=gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)',()=>{
      const context=gsap.context(()=>{
        gsap.from('[data-hero-copy] > *',{y:26,duration:.85,stagger:.09,ease:'power3.out',clearProps:'all'});
        const elements=root.querySelectorAll<HTMLElement>('[data-reveal]');
        elements.forEach(element=>{
          gsap.from(element,{y:28,opacity:.65,duration:.75,ease:'power2.out',clearProps:'all',scrollTrigger:{trigger:element,start:'top 94%',once:true}});
        });
      },root);
      return ()=>context.revert();
    },root);
    return ()=>media.revert();
  },[ref]);
}
