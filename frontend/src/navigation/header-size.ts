/** Reserve the rendered border-box, including iOS safe-area padding. */
export function observeHeaderSize(header: HTMLElement, property: string) {
 const shell=header.closest<HTMLElement>('.usd-live,.usd-member');
 if(!shell)return ()=>{};
 const previous=shell.style.getPropertyValue(property);
 const measure=()=>{
  const height=Math.ceil(header.getBoundingClientRect().height);
  if(height>0)shell.style.setProperty(property,`${height}px`);
 };
 measure();
 const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
 observer?.observe(header);
 const view=header.ownerDocument.defaultView;
 view?.addEventListener('resize',measure);
 return ()=>{
  observer?.disconnect();
  view?.removeEventListener('resize',measure);
  if(previous)shell.style.setProperty(property,previous);
  else shell.style.removeProperty(property);
 };
}
