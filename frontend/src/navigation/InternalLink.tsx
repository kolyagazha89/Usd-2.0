import type {AnchorHTMLAttributes} from 'react';
type Props=AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;go:(path:string)=>void;onNavigate?:()=>void};
export default function InternalLink({href,go,onNavigate,onClick,...props}:Props){
 return <a {...props} href={href} onClick={event=>{
  onClick?.(event);
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||(props.target&&props.target!=='_self')||props.download!==undefined)return;
  event.preventDefault();onNavigate?.();go(href);
 }}/>;
}
