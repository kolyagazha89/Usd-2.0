import {useEffect,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {Copy,QrCode,RotateCcw,ShieldCheck} from 'lucide-react';
import {apiGet,apiPost} from '../api';

type Card={token:string;path:string};
/** A permanent profile locator; never a login credential or stage admission. */
export default function UsdIdCard({participantId}:{participantId?:string}){
 const [card,setCard]=useState<Card|null>(null),[expanded,setExpanded]=useState(false);
 const [loading,setLoading]=useState(true),[rotating,setRotating]=useState(false);
 const [confirmRotate,setConfirmRotate]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=()=>{setLoading(true);setError('');return apiGet<Card>('/participants/me/usd-id').then(setCard).catch(e=>setError(e instanceof Error?e.message:'Не удалось загрузить USD ID')).finally(()=>setLoading(false))};
 useEffect(()=>{if(participantId)void load();else setLoading(false)},[participantId]);
 if(!participantId)return null;
 const url=card?window.location.origin+card.path:'';
 const rotate=async()=>{
  if(!confirmRotate){setConfirmRotate(true);setNotice('');return}
  setRotating(true);setError('');
  try{setCard(await apiPost<Card>('/participants/me/usd-id/rotate',{}));setNotice('USD ID перевыпущен. Старый QR больше не действует.');setConfirmRotate(false)}
  catch(e){setError(e instanceof Error?e.message:'Не удалось перевыпустить USD ID')}
  finally{setRotating(false)}
 };
 return <div className="member-usd-id" aria-label="Постоянный USD ID">
  <button className="member-usd-id-toggle" type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><QrCode size={18}/><span><strong>Мой USD ID</strong><small>Один QR-код для всех этапов</small></span><span aria-hidden="true">{expanded?'−':'+'}</span></button>
  {expanded&&<div className="member-usd-id-body">
   {loading?<p role="status">Подготавливаем ваш USD ID…</p>:error?<div className="form-error" role="alert">{error}<button className="secondary-button compact" type="button" onClick={()=>void load()}>Повторить</button></div>:card?<>
    <div className="member-usd-id-qr"><QRCodeSVG value={url} size={180} marginSize={2} bgColor="#ffffff" fgColor="#15171b" level="M" title="Постоянный USD ID"/></div>
    <p><ShieldCheck size={15}/> Покажите код судье при въезде. Судья выберет текущий этап и увидит вашу регистрацию.</p>
    <p className="member-usd-id-note">Этот код не подтверждает допуск и не заменяет QR отдельной регистрации. Личные контакты в QR не записываются.</p>
    <button type="button" className="secondary-button compact" onClick={()=>{if(!navigator.clipboard?.writeText){setError('Копирование недоступно в этом браузере');return}void navigator.clipboard.writeText(url).then(()=>{setError('');setNotice('Ссылка скопирована')}).catch(()=>setError('Не удалось скопировать ссылку'))}}><Copy size={15}/>Скопировать ссылку</button>
    <div className="member-usd-id-rotate">{confirmRotate&&<p>После перевыпуска все сохранённые и распечатанные старые QR перестанут работать.</p>}<button type="button" className="text-button" disabled={rotating} onClick={()=>void rotate()}><RotateCcw size={15}/>{rotating?'Перевыпускаем…':confirmRotate?'Подтвердить перевыпуск':'Перевыпустить USD ID'}</button>{confirmRotate&&<button type="button" className="text-button" onClick={()=>setConfirmRotate(false)}>Отмена</button>}</div>
   </>:null}
   {notice&&<p role="status" className="member-usd-id-notice">{notice}</p>}
  </div>}
 </div>;
}
