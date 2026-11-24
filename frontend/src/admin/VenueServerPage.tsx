import {useEffect,useState} from 'react';
import VenueReturnReviews from './VenueReturnReviews';
import {Download,RefreshCw} from 'lucide-react';
import {apiGet,apiPost,listData,venueCertificateDownloadUrl,venueCertificateInstallUrl,type User} from '../api';
import {QRCodeSVG} from 'qrcode.react';
import {saveVenueFile,trustedVenueKey,validateVenueStaffExport,type VenueSetup} from './venue-setup-model';
import './venue-server.css';
type Stage={id:string;name:string;date?:string;city?:string;status?:string;resultsPublishedAt?:string|null};
type VenueCertificateInfo={available:boolean;sha256?:string;notAfter?:string;updatedAt?:string};
export default function VenueServerPage({user,go,path,PageFrame}:{user:User;go:(p:string)=>void;path:string;PageFrame:React.ComponentType<any>}){
 const [setup,setSetup]=useState<VenueSetup|null>(null),[stages,setStages]=useState<Stage[]>([]);
 const [stageId,setStageId]=useState(()=>new URLSearchParams(path.split('?')[1]??'').get('stageId')??'');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[attempt,setAttempt]=useState(0);
 const [staffKey,setStaffKey]=useState('');
 const localMode=(window as Window&{__USD_VENUE_MODE__?:unknown}).__USD_VENUE_MODE__===true;
 const [certificate,setCertificate]=useState<VenueCertificateInfo|null>(null);
 const [certificateError,setCertificateError]=useState(''),[certificateBusy,setCertificateBusy]=useState(false);
 useEffect(()=>{
  if(user.role!=='ADMIN'||localMode){setLoading(false);return;}
  let active=true;setLoading(true);setError('');setSetup(null);setStages([]);setStaffKey('');
  Promise.all([apiGet<VenueSetup>('/stages/venue/setup'),apiGet('/stages')]).then(([state,items])=>{
   if(!active)return;
   const available=listData<Stage>(items).filter(s=>['PUBLISHED','COMPLETED'].includes(s.status??''))
    .sort((a,b)=>Date.parse(b.date??'')-Date.parse(a.date??''));
   setSetup(state);setStages(available);
   setStageId(previous=>available.some(s=>s.id===previous)?previous:available[0]?.id??'');
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось проверить сервер. Повторите проверку.')})
   .finally(()=>{if(active)setLoading(false)});
  setCertificate(null);setCertificateError('');
  void apiGet<VenueCertificateInfo>('/stages/venue/certificate').then(info=>{
   if(active)setCertificate(info);
  }).catch(e=>{if(active)setCertificateError(e instanceof Error?e.message:'Не удалось проверить сертификат');});
  return()=>{active=false;};
 },[user.role,attempt,localMode]);
 const downloadStage=async()=>{
  if(!setup||!stageId||busy)return;
  const selected=stageId;setBusy(true);setError('');setNotice('');setStaffKey('');
  try{
   const data=await apiPost('/stages/venue/'+encodeURIComponent(selected)+'/staff-export',{includeCancelled:true});
   const file=validateVenueStaffExport(data,selected,setup);
   saveVenueFile('usd-venue-stage-'+selected+'.json',file.text,'application/json');
   setStaffKey(file.staffKey);
   // Browsers often block a second automatic download on the same click.
   // Unlock stays in memory only; the operator explicitly downloads it.
   setNotice('Пакет скачан. Учётных записей сотрудников: '+file.staffCount+'.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось скачать этап. Повторите попытку.')}
  finally{setBusy(false)}
 };
 const downloadKey=()=>{
  if(!setup)return;
  try{const key=trustedVenueKey(setup);saveVenueFile('signing-public.pem',key.publicKeyPem,'application/x-pem-file');setNotice('Открытый ключ скачан.');}
  catch(e){setError(e instanceof Error?e.message:'Ключ недоступен')}
 };
 const uploadCertificate=async(event:React.ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0];event.target.value='';
  if(!file||certificateBusy)return;
  setCertificateBusy(true);setCertificateError('');setNotice('');
  try{
   if(file.size>8192||file.size<500)throw new Error('Выберите публичный USD-Venue-CA.crt, не закрытый ключ.');
   const pem=await file.text();
   if(!pem.includes('-----BEGIN CERTIFICATE-----')||pem.includes('PRIVATE KEY'))
    throw new Error('Это не публичный корневой сертификат. Выберите USD-Venue-CA.crt с ноутбука.');
   const saved=await apiPost<VenueCertificateInfo>('/stages/venue/certificate',{pem});
   setCertificate(saved);
   setNotice('Сертификат опубликован.');
  }catch(e){setCertificateError(e instanceof Error?e.message:'Сертификат не загружен. Попробуйте снова.')}
  finally{setCertificateBusy(false)}
 };
 const selectedStage=stages.find(stage=>stage.id===stageId);
 const installUrl=certificate?.available&&certificate.sha256?venueCertificateInstallUrl(certificate.sha256):null;
 const downloadStaffKey=()=>{
  saveVenueFile('usd-venue-access-'+stageId+'.key',staffKey+'\n','application/octet-stream');
  setNotice('Ключ судей скачан.');
 };
 const copyCertificateLink=async()=>{
  if(!installUrl)return;
  try{
   await navigator.clipboard.writeText(installUrl);
   setNotice('Ссылка скопирована.');
  }catch{setCertificateError('Не удалось скопировать ссылку.')}
 };
 return <PageFrame className="venue-server-page" title="Офлайн-сервер">
  {user.role!=='ADMIN'?<section className="panel" role="alert">Нужны права администратора USD.</section>:localMode?
   <section className="panel" aria-label="Работа на площадке">
    <div className="venue-server-actions">
     <button className="primary-button" onClick={()=>go('/admin/event-day')}>Открыть день соревнований</button>
     <a className="secondary-button" href={'http://'+window.location.hostname+'/venue/live?screen=spl'} target="_blank" rel="noopener noreferrer">Табло SPL</a>
     <a className="secondary-button" href={'http://'+window.location.hostname+'/venue/live?screen=bfspl-bdw'} target="_blank" rel="noopener noreferrer">Табло BFSPL + BDW SPL</a>
    </div>
   </section>:<>
   <section className="panel" aria-labelledby="venue-download-title">
    <h2 id="venue-download-title">Программа для Windows</h2>
    <div className="venue-server-actions">
     <a className="primary-button" href="/downloads/USD-Offline-Windows.zip" download><Download size={20}/>Скачать для Windows</a>
    </div>
   </section>
   <section className="panel" aria-labelledby="venue-stage-title">
    <h2 id="venue-stage-title">Пакет этапа</h2>
    {loading?<p role="status">Загружаем этапы…</p>:setup?.signing.ready?<>
     <label className="venue-server-stage">Этап
      <select value={stageId} disabled={busy} onChange={e=>{setStageId(e.target.value);setStaffKey('');setNotice('')}}>
       <option value="">Выберите этап</option>
       {stages.map(s=><option key={s.id} value={s.id}>{s.name}{s.city?' · '+s.city:''}{s.date?' · '+new Date(s.date).toLocaleDateString('ru-RU'):''}</option>)}
      </select>
     </label>
     {!stages.length&&<p role="status">Доступных этапов пока нет.</p>}
     {selectedStage?.resultsPublishedAt&&<p role="status">Результаты этапа уже опубликованы.</p>}
     <div className="venue-server-actions">
      <button className="primary-button" type="button" disabled={!stageId||busy} onClick={()=>void downloadStage()}><Download size={18}/>{busy?'Готовим файл…':'Скачать файл этапа'}</button>
      <button className="secondary-button" type="button" disabled={busy} onClick={downloadKey}>Скачать открытый ключ</button>
      {staffKey&&<button className="secondary-button" type="button" onClick={downloadStaffKey}>Скачать ключ судей (.key)</button>}
     </div>
     <code className="venue-server-fingerprint" aria-label="Отпечаток ключа подписи SHA-256">{setup.signing.fingerprint}</code>
    </>:setup?<p role="status">Ключ подписи этапов недоступен.</p>:null}
   </section>
   <section className="panel" aria-labelledby="venue-cert-title">
    <h2 id="venue-cert-title">Скачать сертификат для телефонов</h2>
    <div className="venue-server-actions">
     <label className="secondary-button venue-server-cert-upload">
      <Download size={18}/>{certificateBusy?'Проверяем файл…':'Загрузить сертификат с ноутбука'}
      <input type="file" accept=".crt,.pem,application/x-x509-ca-cert" disabled={certificateBusy} onChange={event=>void uploadCertificate(event)}/>
     </label>
    </div>
    {certificateError&&<p className="form-error" role="alert">{certificateError}</p>}
    {!certificate?.available&&!certificateError&&<p role="status">{certificate?'Сертификат ещё не загружен.':'Проверяем сертификат…'}</p>}
    {installUrl&&certificate?.sha256&&<>
     <p className="venue-server-cert-valid">Сертификат опубликован{certificate.notAfter?' · до '+new Date(certificate.notAfter).toLocaleDateString('ru-RU'):''}</p>
     <div className="venue-server-actions">
      <a className="secondary-button" href={installUrl} target="_blank" rel="noopener noreferrer">Открыть страницу установки</a>
      <button className="secondary-button" type="button" onClick={()=>void copyCertificateLink()}>Скопировать ссылку для MAX</button>
      <a className="secondary-button" href={venueCertificateDownloadUrl('cer',certificate.sha256)} target="_blank" rel="noopener noreferrer">Скачать для iPhone (.cer)</a>
      <a className="secondary-button" href={venueCertificateDownloadUrl('crt',certificate.sha256)} target="_blank" rel="noopener noreferrer">Скачать для Android (.crt)</a>
     </div>
     <div className="venue-server-cert-codes"><div><QRCodeSVG value={installUrl} size={136} title="Скачать сертификат на телефон"/></div></div>
     <code className="venue-server-fingerprint" aria-label="Отпечаток сертификата SHA-256">{certificate.sha256}</code>
    </>}
   </section>
   <VenueReturnReviews/>
   {error&&<div className="form-error venue-server-feedback" role="alert">{error}<button className="secondary-button" disabled={loading||busy} onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={16}/>Повторить проверку</button></div>}
   {notice&&<div className="notice venue-server-feedback" role="status">{notice}</div>}
  </>}
 </PageFrame>;
}
