import {useEffect,useState} from 'react';
import PartnerImage from '../public/PartnerImage';
import {normalizePartnerImageLayout,type PartnerImageLayout} from '../public/partner-image-layout';

const PRESETS=['1:1','2:3','4:3','3:2','16:9','2:1','3:1'];
export default function PartnerImageEditor({value,photoUrl,name,tier,file,disabled,onChange,onValidityChange}:{
 value?:unknown;photoUrl?:string|null;name:string;tier?:string;file?:File|null;disabled:boolean;
 onChange:(value:PartnerImageLayout|undefined)=>void;onValidityChange:(valid:boolean)=>void;
}){
 const layout=normalizePartnerImageLayout(value);
 const [preset,setPreset]=useState(()=>{
  if(!layout.aspectWidth)return 'auto';
  const key=`${layout.aspectWidth}:${layout.aspectHeight}`;
  return PRESETS.includes(key)?key:'custom';
 });
 const [width,setWidth]=useState(String(layout.aspectWidth??16));
 const [height,setHeight]=useState(String(layout.aspectHeight??9));
 const validRatio=(w:string,h:string)=>{
  const a=Number(w),b=Number(h);
  return a>=0.1&&a<=100&&b>=0.1&&b<=100&&a/b>=0.5&&a/b<=5;
 };
 const invalid=preset==='custom'&&!validRatio(width,height);
 useEffect(()=>onValidityChange(!invalid),[invalid,onValidityChange]);
 const custom=(w:string,h:string)=>{
  if(validRatio(w,h))onChange({...layout,aspectWidth:Number(w),aspectHeight:Number(h)});
 };
 const choose=(value:string)=>{
  setPreset(value);
  if(value==='custom'){custom(width,height);return}
  if(value==='auto'){onChange({...layout,aspectWidth:undefined,aspectHeight:undefined});return}
  const [w,h]=value.split(':').map(Number);setWidth(String(w));setHeight(String(h));
  onChange({...layout,aspectWidth:w,aspectHeight:h});
 };
 return <fieldset className="partner-image-editor" disabled={disabled}>
  <legend>Оформление изображения</legend>
  <div className="partner-image-editor-grid">
   <div className="partner-image-controls">
    <div className="form-grid-2">
     <label>Как показывать<select name="imageMode" value={layout.mode} onChange={e=>onChange({...layout,mode:e.target.value as PartnerImageLayout['mode']})}>
      <option value="LOGO">Логотип целиком</option><option value="BANNER">Баннер на весь блок</option>
     </select></label>
     <label>Пропорции рамки<select name="imageAspect" value={preset} onChange={e=>choose(e.target.value)}>
      <option value="auto">Авто — по уровню партнёра</option>
      {PRESETS.map(ratio=><option key={ratio} value={ratio}>{ratio}</option>)}
      <option value="custom">Свои пропорции</option>
     </select></label>
    </div>
    {preset==='custom'&&<div>
     <div className="form-grid-2">
      <label>Ширина пропорции<input name="imageAspectWidth" type="number" inputMode="decimal" min="0.1" max="100" step="0.1" value={width} onChange={e=>{setWidth(e.target.value);custom(e.target.value,height)}} aria-invalid={invalid}/></label>
      <label>Высота пропорции<input name="imageAspectHeight" type="number" inputMode="decimal" min="0.1" max="100" step="0.1" value={height} onChange={e=>{setHeight(e.target.value);custom(width,e.target.value)}} aria-invalid={invalid}/></label>
     </div>
     <p className={invalid?'form-error':'form-hint'} role={invalid?'alert':undefined}>Пропорции от 1:2 до 5:1; каждое число — от 0,1 до 100.</p>
    </div>}
    <label><span className="partner-image-range-label">Масштаб <output>{layout.scale}%</output></span>
     <input name="imageScale" type="range" min="50" max="300" step="5" value={layout.scale} onChange={e=>onChange({...layout,scale:Number(e.target.value)})}/>
    </label>
    <label><span className="partner-image-range-label">По горизонтали <output>{layout.positionX}%</output></span>
     <input name="imagePositionX" type="range" min="0" max="100" value={layout.positionX} onChange={e=>onChange({...layout,positionX:Number(e.target.value)})}/>
    </label>
    <label><span className="partner-image-range-label">По вертикали <output>{layout.positionY}%</output></span>
     <input name="imagePositionY" type="range" min="0" max="100" value={layout.positionY} onChange={e=>onChange({...layout,positionY:Number(e.target.value)})}/>
    </label>
    <p className="form-hint">Меняется форма рамки, а не пропорции логотипа. Баннер заполняет рамку с обрезкой; увеличение помогает убрать лишние поля в исходном файле.</p>
    <button type="button" className="secondary-button compact" onClick={()=>{setPreset('auto');setWidth('16');setHeight('9');onChange(undefined)}}>Сбросить оформление</button>
   </div>
   <div className="partner-image-preview"><span>Предпросмотр изображения</span>
    <div className="partner-image-preview-surface"><PartnerImage src={photoUrl} name={name.trim()||'Партнёр USD'} tier={tier} layout={value} previewFile={file}/></div>
   </div>
  </div>
 </fieldset>;
}
