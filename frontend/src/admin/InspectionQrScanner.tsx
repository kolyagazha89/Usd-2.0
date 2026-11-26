import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,ChevronLeft} from 'lucide-react';
import {apiGet} from '../api';
import jsQR from 'jsqr';
import {parseInspectionQr} from '../participant/usd-id';

export function InspectionQrScanner({onClose,onScan,stageId,initialUsdId,contextLabel='Инспекция'}:{contextLabel?:string;onClose:()=>void;onScan:(stageId:string,registrationId:string)=>void;stageId:string;initialUsdId:string}){
 const videoRef=useRef<HTMLVideoElement|null>(null),busyRef=useRef(false);
 const [error,setError]=useState(''),[manual,setManual]=useState(''),[scannerMode,setScannerMode]=useState('');
 const [choices,setChoices]=useState<any[]>([]),[resolving,setResolving]=useState(false);
 const parse=async(raw:string):Promise<boolean>=>{
  if(busyRef.current)return false;
  busyRef.current=true;setResolving(true);
  try{
   const qr=parseInspectionQr(raw,window.location.origin);
   if(qr.kind==='registration'){setError('');onScan(qr.stageId,qr.registrationId);return true}
   const suffix=stageId?'?stageId='+encodeURIComponent(stageId):'';
   const response=await apiGet<any>('/inspections/usd-id/'+encodeURIComponent(qr.token)+suffix);
   const registrations=Array.isArray(response?.registrations)?response.registrations:[];
   if(!registrations.length)throw new Error(stageId?'У участника нет активной регистрации на выбранный этап. Выберите другой этап или зарегистрируйте участника.':'У участника нет активных регистраций.');
   setError('');
   if(registrations.length===1){onScan(registrations[0].stageId,registrations[0].id);return true}
   setChoices(registrations);return true;
  }catch(e){setError(e instanceof Error?e.message:'Не удалось прочитать QR-код');return false}
  finally{busyRef.current=false;setResolving(false)}
 };
 useEffect(()=>{if(initialUsdId)void parse(window.location.origin+'/usd-id/'+initialUsdId)},[initialUsdId]);
 useEffect(()=>{let active=true,stream:MediaStream|null=null,frame=0,timeout=0;const start=async()=>{
  if(!navigator.mediaDevices?.getUserMedia){setError('Камера недоступна. Откройте страницу по HTTPS или вставьте ссылку из QR-кода ниже.');return}
  try{
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
   if(!active){stream.getTracks().forEach(track=>track.stop());return}
   const video=videoRef.current;if(!video)return;video.srcObject=stream;await video.play();
   const Detector=(window as any).BarcodeDetector;let detector:any=null;
   if(typeof Detector==='function'){try{detector=new Detector({formats:['qr_code']})}catch{detector=null}}
   setScannerMode(detector?'Встроенное распознавание QR':'Совместимое распознавание QR для этого браузера');
   const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
   if(!context){setError('Не удалось подготовить распознавание QR. Вставьте ссылку ниже.');return}
   let scan:()=>Promise<void>=async()=>{};
   const schedule=()=>{if(!active)return;if(detector)frame=requestAnimationFrame(()=>void scan());else timeout=window.setTimeout(()=>void scan(),180)};
   scan=async()=>{if(!active)return;if(video.readyState>=2){
    let raw='';
    if(detector){try{const found=await detector.detect(video);raw=found?.[0]?.rawValue||''}catch{detector=null;setScannerMode('Совместимое распознавание QR для этого браузера')}}
    if(!detector&&!raw){const width=Math.min(video.videoWidth||0,1280),height=width&&video.videoWidth?Math.max(1,Math.round(width*video.videoHeight/video.videoWidth)):0;if(width&&height){canvas.width=width;canvas.height=height;context.drawImage(video,0,0,width,height);try{raw=jsQR(context.getImageData(0,0,width,height).data,width,height,{inversionAttempts:'attemptBoth'})?.data||''}catch{raw=''}}}
    if(raw&&await parse(raw))return;
   }schedule()};
   void scan();
  }catch{setError('Не удалось включить камеру. Проверьте разрешение браузера или вставьте ссылку вручную.')}
 };void start();return()=>{active=false;if(frame)cancelAnimationFrame(frame);if(timeout)window.clearTimeout(timeout);stream?.getTracks().forEach(track=>track.stop())}},[stageId]);
 return <section className="panel resource-editor-page qr-scanner-page"><div className="resource-editor-heading"><div><span className="eyebrow">{contextLabel} · QR</span><h2>USD ID или QR регистрации</h2></div><button type="button" className="secondary-button" onClick={onClose}><ChevronLeft size={16}/>К списку</button></div><div className="qr-scanner-modal">
  {error&&<div className="notice" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
  {choices.length>0?<div className="panel"><h3>Выберите регистрацию</h3><p>Участник зарегистрирован на нескольких автомобилях или этапах.</p>{choices.map((row:any)=><button key={row.id} type="button" className="secondary-button" style={{display:'flex',width:'100%',justifyContent:'space-between',marginBottom:8}} onClick={()=>onScan(row.stageId,row.id)}><span>{row.stage?.name||'Этап USD'} · {[row.car?.brand,row.car?.model].filter(Boolean).join(' ')}</span><strong>№ {row.participantNumber} · {(row.stageInspection??row.inspection)?.status==='PASSED'?'Допущен':(row.stageInspection??row.inspection)?.status==='FAILED'?'Не допущен':'Ожидает инспекции'}</strong></button>)}</div>:<><div className="qr-camera-viewport"><video ref={videoRef} muted playsInline autoPlay aria-label="Камера для сканирования QR-кода"/><div className="qr-camera-overlay" aria-hidden="true"><div className="qr-camera-target"><span/><span/><span/><span/></div><small>Поместите QR-код внутрь рамки</small></div></div>{scannerMode&&<small className="field-help">{scannerMode}</small>}<p>Постоянный USD ID найдёт регистрацию на выбранный этап. Старый QR регистрации продолжает работать без изменений.</p><form className="form" onSubmit={e=>{e.preventDefault();void parse(manual)}}><label>Или вставьте ссылку из QR-кода<input value={manual} onChange={e=>setManual(e.target.value)} placeholder="https://app.usd-russia.ru/usd-id/…" /></label><button className="primary-button" disabled={!manual.trim()||resolving}>{resolving?'Ищем регистрацию…':'Открыть регистрацию'}</button></form></>}
 </div></section>;
}
