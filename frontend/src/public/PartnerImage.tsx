import {useEffect,useState,type CSSProperties} from 'react';
import {Photo} from './PremiumUI';
import {normalizePartnerImageLayout} from './partner-image-layout';
import './partner-image.css';

export default function PartnerImage({src,name,layout,tier='REGULAR',previewFile}:{
 src?:string|null;name:string;layout?:unknown;tier?:string;previewFile?:File|null;
}){
 const framing=normalizePartnerImageLayout(layout);
 const [preview,setPreview]=useState<{file:File;url:string}|null>(null);
 const [failedFile,setFailedFile]=useState<File|null>(null);
 useEffect(()=>{
  if(!previewFile){setPreview(null);setFailedFile(null);return}
  setFailedFile(null);
  const url=URL.createObjectURL(previewFile);
  setPreview({file:previewFile,url});
  return()=>URL.revokeObjectURL(url);
 },[previewFile]);
 const localUrl=preview&&preview.file===previewFile?preview.url:undefined;
 const legacy=layout===undefined;
 const imageClass=legacy?'partner-image-legacy-content p-partner-logo':'partner-image-content';
 const content=localUrl?(failedFile===previewFile
  ?<div className={imageClass+' p-photo-fallback'} role="img" aria-label="Не удалось открыть файл">Не удалось открыть файл. Выберите другое изображение.</div>
  :<img className={imageClass} src={localUrl} alt={name} onError={()=>setFailedFile(previewFile??null)}/>)
  :<Photo src={src??undefined} alt={name} className={imageClass} fallback={name}/>;
 if(legacy)return <div className="partner-image-legacy" data-tier={tier}>{content}</div>;
 const position=`${framing.positionX}% ${framing.positionY}%`;
 const hasCustomRatio=framing.aspectWidth!==undefined&&framing.aspectHeight!==undefined;
 const style={
  ...(hasCustomRatio
   ?{aspectRatio:`${framing.aspectWidth} / ${framing.aspectHeight}`,height:'auto',
      '--partner-custom-ratio':String(framing.aspectWidth!/framing.aspectHeight!)}:{}),
  '--partner-image-fit':framing.mode==='BANNER'?'cover':'contain',
  '--partner-image-scale':String(framing.scale/100),
  '--partner-image-position':position,
 } as CSSProperties;
 return <div className="partner-image-frame" data-mode={framing.mode} data-tier={tier} data-custom-ratio={hasCustomRatio?'true':undefined} style={style}>
  <div className="partner-image-canvas">{content}</div>
 </div>;
}
