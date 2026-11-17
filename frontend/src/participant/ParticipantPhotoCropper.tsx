import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {clampCropOffsets,cropDrawRect,cropMetrics} from './photo-crop-math';
import './participant-photo-crop.css';

type PointerPoint={x:number;y:number};
type CropState={image:HTMLImageElement|null;zoom:number;x:number;y:number};
type Gesture={kind:'drag';startX:number;startY:number;x:number;y:number}|
 {kind:'pinch';distance:number;middleX:number;middleY:number;zoom:number;x:number;y:number};

export default function ParticipantPhotoCropper({
 file,busy,onCancel,onSave,
}:{file:File;busy:boolean;onCancel:()=>void;onSave:(prepared:File)=>Promise<void>}){
 const area=useRef<HTMLDivElement>(null);
 const displayed=useRef<HTMLImageElement>(null);
 const preview=useRef<HTMLCanvasElement>(null);
 const imageState=useRef<CropState>({image:null,zoom:1,x:0,y:0});
 const activePointers=useRef<Map<number,PointerPoint>>(new Map());
 const gesture=useRef<Gesture|null>(null);
 const [ready,setReady]=useState(false);
 const [error,setError]=useState('');

 const measure=()=>{
  const image=imageState.current.image,frame=area.current?.clientWidth??0;
  return image&&frame>0?cropMetrics(image.naturalWidth,image.naturalHeight,frame,imageState.current.zoom):null;
 };
 const paint=(canvas:HTMLCanvasElement,circle:boolean)=>{
  const image=imageState.current.image,metrics=measure();
  if(!image||!metrics)return;
  const c=canvas.getContext('2d');
  if(!c)return;
  const {left,top,width,height}=cropDrawRect(metrics,imageState.current);
  const factor=canvas.width/metrics.frame;
  c.clearRect(0,0,canvas.width,canvas.height);
  if(circle){c.save();c.beginPath();c.arc(canvas.width/2,canvas.height/2,canvas.width/2,0,Math.PI*2);c.clip();}
  c.drawImage(image,left*factor,top*factor,width*factor,height*factor);
  if(circle)c.restore();
 };
 const render=()=>{
  const metrics=measure(),img=displayed.current;
  if(!metrics||!img)return;
  const bounded=clampCropOffsets(imageState.current.x,imageState.current.y,metrics);
  imageState.current.x=bounded.x;
  imageState.current.y=bounded.y;
  const rect=cropDrawRect(metrics,bounded);
  img.style.width=rect.width+'px';
  img.style.height=rect.height+'px';
  img.style.left=rect.left+'px';
  img.style.top=rect.top+'px';
  if(preview.current)paint(preview.current,true);
 };
 useEffect(()=>{
  let active=true;
  const url=URL.createObjectURL(file),img=new Image();
  imageState.current={image:null,zoom:1,x:0,y:0};
  setReady(false);setError('');
  img.onload=()=>{if(!active)return;imageState.current.image=img;
   if(displayed.current)displayed.current.src=url;
   setReady(true);requestAnimationFrame(()=>{if(active)render()});
  };
  img.onerror=()=>{if(active)setError('Не удалось открыть это фото. Выберите другое изображение.')};
  img.src=url;
  return ()=>{active=false;img.onload=null;img.onerror=null;URL.revokeObjectURL(url)};
 },[file]);
 useEffect(()=>{
  if(!area.current||typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(()=>render());
  observer.observe(area.current);
  return ()=>observer.disconnect();
 },[]);

 const points=()=>[...activePointers.current.values()];
 const setupGesture=()=>{
  const list=points(),st=imageState.current;
  if(list.length>=2){
   const a=list[0],b=list[1];
   gesture.current={kind:'pinch',distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),
    middleX:(a.x+b.x)/2,middleY:(a.y+b.y)/2,zoom:st.zoom,x:st.x,y:st.y};
  }else if(list.length===1){
   gesture.current={kind:'drag',startX:list[0].x,startY:list[0].y,x:st.x,y:st.y};
  }else gesture.current=null;
 };
 const onDown=(event:PointerEvent<HTMLDivElement>)=>{
  if(!ready||busy)return;
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  activePointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
  setupGesture();
 };
 const onMove=(event:PointerEvent<HTMLDivElement>)=>{
  if(!activePointers.current.has(event.pointerId)||busy)return;
  event.preventDefault();
  activePointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
  const list=points(),g=gesture.current,st=imageState.current;
  if(!g)return;
  if(list.length>=2&&g.kind==='pinch'){
   const a=list[0],b=list[1];
   const distance=Math.hypot(a.x-b.x,a.y-b.y);
   st.zoom=Math.max(1,Math.min(5,g.zoom*distance/g.distance));
   const ratio=st.zoom/g.zoom;
   st.x=g.x*ratio+(a.x+b.x)/2-g.middleX;
   st.y=g.y*ratio+(a.y+b.y)/2-g.middleY;
  }else if(list.length===1&&g.kind==='drag'){
   st.x=g.x+list[0].x-g.startX;
   st.y=g.y+list[0].y-g.startY;
  }
  render();
 };
 const onEnd=(event:PointerEvent<HTMLDivElement>)=>{
  activePointers.current.delete(event.pointerId);
  setupGesture();
 };
 const save=()=>{
  if(!ready||busy||!imageState.current.image)return;
  setError('');
  const canvas=document.createElement('canvas');
  canvas.width=640;canvas.height=640;
  paint(canvas,false);
  canvas.toBlob(blob=>{
   if(!blob){setError('Не удалось сохранить фотографию. Попробуйте другое изображение.');return;}
   void onSave(new File([blob],'usd-profile-avatar.jpg',{type:'image/jpeg'}))
    .catch(()=>setError('Не удалось загрузить фотографию. Попробуйте ещё раз.'));
  },'image/jpeg',0.9);
 };

 return <section className="participant-section member-photo-crop" aria-label="Кадрирование фотографии профиля">
  <button type="button" className="member-photo-crop-back" onClick={onCancel} disabled={busy}>← К личным данным</button>
  <div className="participant-section-head"><div>
   <span className="eyebrow">ФОТО ПРОФИЛЯ / ПРЕДПРОСМОТР</span>
   <h2>Настройка фото</h2>
   <p>Передвигайте фото пальцем, увеличивайте двумя пальцами. Без ползунков.</p>
  </div></div>
  <div className="member-photo-crop-frame" ref={area} role="group" aria-label="Выберите область фотографии"
   onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd}>
   <img ref={displayed} alt="" draggable={false} className="member-photo-crop-source"/>
   <div className="member-photo-crop-ring" aria-hidden="true"/>
   {!ready&&!error&&<span className="member-photo-crop-loading" role="status">Подготавливаем фото…</span>}
  </div>
  <p className="member-photo-crop-caption">Так будет выглядеть аватар</p>
  <canvas ref={preview} className="member-photo-crop-preview" width={160} height={160} aria-label="Предпросмотр аватара" role="img"/>
  {error&&<p role="alert" className="member-photo-crop-error">{error}</p>}
  <div className="member-photo-crop-actions">
   <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Отмена</button>
   <button type="button" className="primary-button" onClick={save} disabled={!ready||busy}>{busy?'Загружаем…':'Применить фото'}</button>
  </div>
  <small>Фото загружается только после подтверждения. Исходный файл не меняется.</small>
 </section>;
}
