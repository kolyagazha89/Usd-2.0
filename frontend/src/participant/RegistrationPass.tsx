import './registration-pass.css';
import {useEffect,useRef,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {CheckCircle2,ChevronLeft,ClipboardCopy,Download,RefreshCw,ShieldCheck} from 'lucide-react';
import {apiGet} from '../api';

type UsdId={token:string;path:string};
type Registration={
 id:string;stageId:string;participantNumber:number;status:string;
 stage?:{id:string;name:string;date:string;city?:string|null;venue?:string|null;address?:string|null};
 participant?:{lastName:string;firstName:string;middleName?:string|null};
 car?:{brand:string;model:string;registrationNumber?:string|null};
 numbers?:Array<{id:string;number:number;isPrimary:boolean}>;
 classes?:Array<{id:string;classId:string;numberId:string;class?:{name:string;direction?:{name:string}};number?:{id:string;number:number}}>;
};
export function registrationPassQrUrl(registration:Pick<Registration,'id'|'stageId'|'stage'>,origin:string){
 const stageId=registration.stageId||registration.stage?.id;
 if(!registration.id||!stageId)throw new Error('Недостаточно данных для QR регистрации');
 return origin+'/admin/inspections?stageId='+encodeURIComponent(stageId)+'&registrationId='+encodeURIComponent(registration.id);
}
function printableDate(raw:string|undefined){
 if(!raw)return 'Дата уточняется';
 const date=new Date(raw);return Number.isNaN(date.valueOf())?'Дата уточняется':date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
}
export default function RegistrationPass({registrationId,go}:{registrationId:string;go:(path:string)=>void}){
 const [registration,setRegistration]=useState<Registration|null>(null);
 const [usdId,setUsdId]=useState<UsdId|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const qrRef=useRef<HTMLDivElement>(null);
 const reload=()=>{
  if(!registrationId){setLoading(false);setError('Не указан идентификатор регистрации');return}
  let alive=true;
  setLoading(true);setError('');setNotice('');
  Promise.all([apiGet<Registration>('/registrations/'+encodeURIComponent(registrationId)),apiGet<UsdId>('/participants/me/usd-id')])
   .then(([r,id])=>{if(!alive)return;setRegistration(r);setUsdId(id)})
   .catch(e=>{if(alive){setRegistration(null);setError(e instanceof Error?e.message:'Не удалось открыть пропуск')}})
   .finally(()=>{if(alive)setLoading(false)});
  return()=>{alive=false};
 };
 useEffect(()=>reload(),[registrationId]);
 const saveQr=()=>{
  try{
   const svg=qrRef.current?.querySelector('svg');
   if(!svg)throw new Error('QR-код ещё не готов');
   const content=new XMLSerializer().serializeToString(svg);
   const blob=new Blob([content],{type:'image/svg+xml;charset=utf-8'});
   const url=URL.createObjectURL(blob);
   const link=document.createElement('a');link.href=url;link.download='USD-QR-'+registrationId.slice(0,8)+'.svg';
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),3000);setNotice('QR-код сохранён');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить QR-код')}
 };
 const copyId=()=>{
  if(!usdId?.token){setError('USD ID ещё не готов');return}
  if(!navigator.clipboard?.writeText){setError('Копирование недоступно. Вы можете переписать USD ID вручную.');return}
  void navigator.clipboard.writeText(usdId.token).then(()=>{setError('');setNotice('USD ID скопирован')})
   .catch(()=>setError('Не удалось скопировать USD ID'));
 };
 if(loading)return <main className="usd-registration-pass-page" role="status"><div className="usd-registration-pass"><p>Загружаем ваш пропуск USD…</p></div></main>;
 if(error&&!registration)return <main className="usd-registration-pass-page"><div className="usd-registration-pass"><h1>Пропуск недоступен</h1><p role="alert">{error}</p><div className="usd-registration-pass-actions"><button type="button" onClick={()=>reload()}><RefreshCw size={16}/>Повторить</button><button type="button" onClick={()=>go('/participant?tab=registrations')}>К моим регистрациям</button></div></div></main>;
 if(!registration||!usdId)return null;
 const active=registration.status!=='CANCELLED'&&registration.status!=='REJECTED';
 let qrUrl='';
 try{qrUrl=registrationPassQrUrl(registration,window.location.origin)}catch{}
 const numbers=[...(registration.numbers??[])].sort((a,b)=>a.number-b.number);
 const displayedNumbers=numbers.length?numbers.map(n=>n.number):[registration.participantNumber];
 const classRows=(registration.classes??[]).map(c=>({
  id:c.id,name:c.class?.name||'Класс USD',direction:c.class?.direction?.name||'Направление уточняется',
  number:c.number?.number??numbers.find(n=>n.id===c.numberId)?.number??registration.participantNumber,
 }));
 const participant=[registration.participant?.lastName,registration.participant?.firstName,registration.participant?.middleName].filter(Boolean).join(' ');
 return <main className="usd-registration-pass-page">
  <div className="usd-registration-pass">
   <button type="button" className="usd-registration-pass-back" onClick={()=>go('/participant?tab=registrations')}><ChevronLeft size={18}/>Мои регистрации</button>
   <header className="usd-registration-pass-heading"><span>USD · ПРОПУСК УЧАСТНИКА</span><h1>{active?'Вы зарегистрированы на этап':'Регистрация отменена'}</h1><p>{active?'Заявка сохранена в системе USD. Подготовьте пропуск к посещению площадки.':'Этот пропуск недействителен. Вы можете посмотреть историю регистрации.'}</p></header>
   <div className="usd-registration-pass-content">
    <section className="usd-registration-pass-info" aria-label="Данные подтверждённой регистрации">
     <div className="usd-registration-pass-status"><CheckCircle2 size={19}/>{active?'Регистрация активна':'Регистрация отменена'}</div>
     <h2>{registration.stage?.name||'Этап USD'}</h2>
     <p className="usd-registration-pass-event">{printableDate(registration.stage?.date)} · {[registration.stage?.city,registration.stage?.venue,registration.stage?.address].filter(Boolean).join(' · ')||'Место проведения уточняется'}</p>
     <dl>
      <div><dt>Участник</dt><dd>{participant||'Участник USD'}</dd></div>
      <div><dt>USD ID участника</dt><dd className="usd-registration-pass-id">{usdId.token}</dd></div>
      <div><dt>Автомобиль</dt><dd>{[registration.car?.brand,registration.car?.model].filter(Boolean).join(' ')||'Не указан'}{registration.car?.registrationNumber?' · '+registration.car.registrationNumber:''}</dd></div>
      <div><dt>Стартовые номера</dt><dd>{displayedNumbers.map(n=>'№ '+String(n).padStart(3,'0')).join(' · ')}</dd></div>
      <div><dt>Оплата</dt><dd>Статус оплаты уточняется у организатора</dd></div>
     </dl>
     <h3>Классы и номера</h3>
     {classRows.length?<div className="usd-registration-pass-classes">{classRows.map(row=><div key={row.id}><strong>№ {String(row.number).padStart(3,'0')}</strong><span>{row.direction} · {row.name}</span></div>)}</div>:<p>Классы уточняются организатором.</p>}
    </section>
    <section className="usd-registration-pass-qr-panel" aria-label="QR-пропуск">
     <h2>QR-код для инспекции</h2>
     {active&&qrUrl?<div className="usd-registration-pass-qr" ref={qrRef}><QRCodeSVG value={qrUrl} size={236} marginSize={2} level="M" bgColor="#fff" fgColor="#12161e" title="QR регистрации для инспекции"/></div>:<p>QR недоступен для отменённой регистрации.</p>}
     <p className="usd-registration-pass-security"><ShieldCheck size={17}/> QR служит только для поиска заявки судьёй и не заменяет проверку личности или допуск.</p>
     <p className="usd-registration-pass-reminder">Сохраните пропуск: сделайте скриншот QR-кода или запишите свой USD ID. Они понадобятся для быстрого поиска регистрации на площадке, особенно при отсутствии интернета.</p>
     <div className="usd-registration-pass-actions">
      {active&&qrUrl&&<button type="button" onClick={saveQr}><Download size={16}/>Сохранить QR-код</button>}
      <button type="button" onClick={copyId}><ClipboardCopy size={16}/>Скопировать USD ID</button>
      <button type="button" onClick={()=>go('/participant?tab=registrations')}>Перейти к моим регистрациям</button>
     </div>
     {notice&&<p role="status" className="usd-registration-pass-notice">{notice}</p>}
     {error&&<p role="alert" className="usd-registration-pass-error">{error}</p>}
    </section>
   </div>
  </div>
 </main>;
}
