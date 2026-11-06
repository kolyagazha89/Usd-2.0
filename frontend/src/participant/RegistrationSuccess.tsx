import {useEffect,useId,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {apiGet} from '../api';
import {registrationInspectionQrUrl,registrationNumbers,titleName,type RegistrationPassData} from './registration-pass-utils';
import './registration-success.css';


function RegistrationSuccess({registration,go}:{registration:RegistrationPassData;go:(path:string)=>void}){
 const svgId=useId().replace(/:/g,'');
 const [usdId,setUsdId]=useState(''),[usdIdLoading,setUsdIdLoading]=useState(true),[notice,setNotice]=useState('');
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;setUsdId('');setError('');setUsdIdLoading(true);
  apiGet<{token:string}>('/participants/me/usd-id').then(result=>{if(active)setUsdId(result.token)}).catch(err=>{if(active)setError(err instanceof Error?err.message:'USD ID временно недоступен')}).finally(()=>{if(active)setUsdIdLoading(false)});
  return()=>{active=false};
 },[registration.id]);
 const copyUsdId=async()=>{if(!usdId)return;try{await navigator.clipboard.writeText(usdId);setNotice('USD ID скопирован')}catch{setNotice('Не удалось скопировать USD ID. Выделите его и скопируйте вручную.')}};
 const saveQr=()=>{const svg=document.getElementById(svgId);if(!(svg instanceof SVGSVGElement)){setNotice('QR-код пока не готов');return}
  const source=new XMLSerializer().serializeToString(svg);const file=new Blob([source],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download='USD-pass-'+String(registration.participantNumber||registration.id.slice(0,8))+'.svg';document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1500);setNotice('QR-код сохранён');
 };
 const qr=registrationInspectionQrUrl(window.location.origin,registration);
 const numbers=registrationNumbers(registration);
 const stage=registration.stage||{id:registration.stageId||'',name:'',date:'',city:'',venue:'',address:''};
 const inspection=registration.stageInspection??registration.inspection;
 const currentStatus=registration.status==='CANCELLED'?'Отменена':inspection?.status==='PASSED'?'Активна · инспекция пройдена':inspection?.status==='FAILED'?'Активна · инспекция не пройдена':'Заявка подана · ожидает инспекции';
 return <section className="usd-registration-success" aria-labelledby="usd-pass-title">
  <div className="usd-pass-hero"><span className="usd-pass-check" aria-hidden="true">✓</span><div>
   <span className="usd-pass-kicker">USD · ПРОПУСК УЧАСТНИКА</span><h1 id="usd-pass-title">Регистрация успешно сохранена</h1>
   <p>Ваша заявка подтверждена системой USD. Сохраните пропуск для инспекции на площадке.</p>
  </div></div>
  <div className="usd-pass-layout">
   <article className="usd-pass-card">
    <header><span>УЧАСТНИК</span><h2>{titleName(registration)}</h2><p>{[registration.car?.brand,registration.car?.model,registration.car?.registrationNumber].filter(Boolean).join(' · ')}</p></header>
    <dl>
     <div><dt>Этап</dt><dd>{stage.name||'Этап USD'}</dd></div>
     <div><dt>Дата</dt><dd>{stage.date?new Date(stage.date).toLocaleDateString('ru-RU',{year:'numeric',month:'long',day:'numeric'}):'Уточняется'}</dd></div>
     <div><dt>Место</dt><dd>{[stage.city,stage.venue,stage.address].filter(Boolean).join(' · ')||'Уточняется'}</dd></div>
     <div><dt>Статус</dt><dd>{currentStatus}</dd></div>
     <div><dt>Оплата</dt><dd>Нет подтверждённых данных об оплате. Уточните у организатора на площадке</dd></div>
    </dl>
    <h3>Стартовые номера и классы</h3>
    <div className="usd-pass-number-grid">{numbers.map(number=><section key={number} className="usd-pass-number">
     <strong>№ {String(number).padStart(3,'0')}</strong>
     <ul>{(registration.classes||[]).filter(item=>item.number?.number===number||registration.numbers?.find(n=>n.number===number)?.id===item.numberId).map(item=><li key={item.id}>{[item.class?.direction?.name,item.class?.name].filter(Boolean).join(' · ')}</li>)}</ul>
    </section>)}</div>
   </article>
   <aside className="usd-pass-qr-card">
    <span className="usd-pass-kicker">ПОКАЖИТЕ НА ИНСПЕКЦИИ</span>
    <div className="usd-pass-qr-frame"><QRCodeSVG id={svgId} value={qr} size={236} level="M" marginSize={2} title="QR-код пропуска USD для инспекции" role="img" aria-label="QR-код пропуска USD для инспекции"/></div>
    <span className="usd-pass-id-caption">Постоянный USD ID участника</span>
    {usdIdLoading?<p role="status">Получаем USD ID…</p>:usdId?<code className="usd-pass-id">{usdId}</code>:<p className="usd-pass-error" role="alert">{error}</p>}
    <div className="usd-pass-buttons">
     <button type="button" className="primary-button" onClick={saveQr}>Сохранить QR-код</button>
     <button type="button" className="secondary-button" disabled={!usdId} onClick={()=>void copyUsdId()}>Скопировать USD ID</button>
     <button type="button" className="secondary-button" onClick={()=>go('/participant?tab=registrations')}>Перейти к моим регистрациям</button>
    </div>
    {notice&&<p className="usd-pass-notice" role="status">{notice}</p>}
   </aside>
  </div>
  <p className="usd-pass-reminder"><strong>Сохраните пропуск:</strong> сделайте скриншот QR-кода или запишите свой USD ID. Они понадобятся для быстрого поиска регистрации на площадке, особенно при отсутствии интернета.</p>
  <small className="usd-pass-disclaimer">QR-код содержит ссылку на карточку инспекции USD. Сам по себе он не предоставляет прав на изменение данных и требует авторизации судьи.</small>
 </section>;
}
export default RegistrationSuccess;
