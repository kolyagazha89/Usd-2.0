import {useEffect,useRef,useState} from 'react';
import {apiPost} from './api';

export default function VerificationResend({registeredEmail}:{registeredEmail?:string}){
 const[email,setEmail]=useState(registeredEmail??'');
 const[deadline,setDeadline]=useState(()=>registeredEmail?Date.now()+60_000:0);
 const[remaining,setRemaining]=useState(registeredEmail?60:0);
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pending=useRef(false),active=useRef(true);
 useEffect(()=>{
  active.current=true;
  const tick=()=>setRemaining(Math.max(0,Math.ceil((deadline-Date.now())/1000)));
  tick();const timer=window.setInterval(tick,1000);
  return()=>{active.current=false;window.clearInterval(timer)};
 },[deadline]);
 const resend=async()=>{
  if(pending.current||Date.now()<deadline)return;
  const recipient=(registeredEmail??email).trim().toLowerCase();
  if(recipient.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(recipient)){setError('Укажите корректный email.');return}
  pending.current=true;setBusy(true);setError('');setNotice('');
  // A failed or timed-out request may already have reserved a server attempt.
  // Keep the local cooldown even when the response never reaches the browser.
  setDeadline(Date.now()+60_000);setRemaining(60);
  try{
   const result=await apiPost<{message?:string}>('/auth/resend-verification',{email:recipient});
   if(active.current){setDeadline(Date.now()+60_000);setRemaining(60);setNotice(result.message||'Если аккаунт ожидает подтверждения, мы попробуем отправить письмо. Проверьте «Входящие» и «Спам».')}
  }catch(e){if(active.current)setError(e instanceof Error?e.message:'Не удалось запросить письмо. Попробуйте позже.')}
  finally{pending.current=false;if(active.current)setBusy(false)}
 };
 const control=<><button type="submit" className="secondary-button" disabled={busy||remaining>0}>{busy?'Запрашиваем письмо…':'Отправить письмо повторно'}</button>{remaining>0&&<p className="muted">Повторный запрос через {remaining} с.</p>}</>;
 return <section className="verification-resend" aria-labelledby="verification-resend-title">
  <h2 id="verification-resend-title">Подтвердите email</h2>
  <p>Откройте ссылку в письме. Если письма нет, проверьте папку «Спам» или запросите его повторно.</p>
  {registeredEmail?<><p className="verification-resend-address">{registeredEmail}</p><form onSubmit={e=>{e.preventDefault();void resend()}}>{control}</form></>:<form className="form" onSubmit={e=>{e.preventDefault();void resend()}}><label>Email для подтверждения<input type="email" autoComplete="email" maxLength={254} value={email} onChange={e=>{setEmail(e.target.value);setError('');setNotice('')}} required disabled={busy}/></label>{control}</form>}
  <p className="muted">Не чаще раза в минуту и не более 5 повторных отправок за час.</p>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {notice&&<p className="notice" role="status">{notice}</p>}
 </section>;
}
