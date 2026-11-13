type Point={identifier:number;clientX:number;clientY:number};
type Gesture={id:number;x:number;y:number;open:boolean;axis:'pending'|'horizontal'};
type DrawerControl={isOpen:()=>boolean;enabled:()=>boolean;onChange:(open:boolean)=>void};

/** Drawer gestures never push or consume history entries. Native scrolling wins
 * outside the narrow opening edge and once a vertical gesture is identified. */
export function bindAdminDrawerSwipe(root:HTMLElement,control:DrawerControl){
 let gesture:Gesture|null=null;
 const eligible=(target:EventTarget|null,open:boolean)=>{
  const element=target as Element|null;
  if(!element?.closest||element.closest('input,textarea,select,[contenteditable="true"],[role="slider"],canvas,video,.modal-backdrop,[role="dialog"]'))return false;
  if(!open&&element.closest('button,a'))return false;
  for(let node:Element|null=element;node&&node!==root;node=node.parentElement){
   const style=root.ownerDocument.defaultView?.getComputedStyle(node);
   if(node.scrollWidth>node.clientWidth+1&&/(auto|scroll)/.test(style?.overflowX??''))return false;
  }
  return true;
 };
 const cancel=()=>{gesture=null};
 const start=(event:TouchEvent)=>{
  cancel();if(!control.enabled()||event.touches.length!==1)return;
  const point=event.touches[0],open=control.isOpen();
  if((!open&&point.clientX>64)||!eligible(event.target,open))return;
  gesture={id:point.identifier,x:point.clientX,y:point.clientY,open,axis:'pending'};
  // WebKit's history recognizer must be cancelled at touchstart, before it
  // takes ownership of the screen-edge gesture. Keep this limited to the edge.
  if(!open&&point.clientX<=20&&event.cancelable)event.preventDefault();
 };
 const pointFor=(points:TouchList):Point|undefined=>Array.from(points).find(point=>point.identifier===gesture?.id);
 const move=(event:TouchEvent)=>{
  if(!gesture)return;
  if(!control.enabled()||event.touches.length!==1){cancel();return}
  const point=pointFor(event.touches);if(!point){cancel();return}
  const dx=point.clientX-gesture.x,dy=point.clientY-gesture.y;
  if(gesture.axis==='pending'){
   if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;
   if(Math.abs(dx)<Math.abs(dy)*1.4){cancel();return}
   gesture.axis='horizontal';
  }
  if(event.cancelable)event.preventDefault();
 };
 const end=(event:TouchEvent)=>{
  if(!gesture)return;
  const point=pointFor(event.changedTouches),current=gesture;cancel();
  if(!point||!control.enabled()||current.axis!=='horizontal')return;
  if(event.cancelable)event.preventDefault(); // Suppress a click on a nav row.
  const dx=point.clientX-current.x,dy=point.clientY-current.y;
  if(Math.abs(dx)<56||Math.abs(dx)<Math.abs(dy)*1.4)return;
  if(!current.open&&dx>0)control.onChange(true);
  if(current.open&&dx<0)control.onChange(false);
 };
 root.addEventListener('touchstart',start,{passive:false,capture:true});
 root.addEventListener('touchmove',move,{passive:false,capture:true});
 root.addEventListener('touchend',end,{passive:false,capture:true});
 root.addEventListener('touchcancel',cancel,{capture:true});
 return()=>{cancel();root.removeEventListener('touchstart',start,true);root.removeEventListener('touchmove',move,true);root.removeEventListener('touchend',end,true);root.removeEventListener('touchcancel',cancel,true)};
}
