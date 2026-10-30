import {useEffect,useRef,useState,type FormEvent} from 'react';
import {AlertTriangle,CheckCircle2,KeyRound,Loader2,Mail,RefreshCw,ShieldCheck,Smartphone} from 'lucide-react';
import {apiDelete,apiGet,apiPost,listData} from './api';
import './participant-account-security.css';

type AccountSession={id:string;userAgent:string|null;ipAddress:string|null;createdAt:string;updatedAt:string;expiresAt:string};
type Confirmation={kind:'password'}|{kind:'all'}|{kind:'session';session:AccountSession};
const message=(cause:unknown,fallback:string)=>cause instanceof Error?cause.message:fallback;
const validPassword=(value:string)=>value.length>=8&&value.length<=128;
const date=(value:string)=>{const parsed=new Date(value);return Number.isFinite(parsed.getTime())?parsed.toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}):'Не указано'};

export default function ParticipantAccountSecurity({email,onLogout}:{email:string;onLogout:()=>Promise<void>}){
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [passwordConfirmation,setPasswordConfirmation]=useState('');
  const [newEmail,setNewEmail]=useState('');
  const [emailPassword,setEmailPassword]=useState('');
  const [passwordError,setPasswordError]=useState('');
  const [emailError,setEmailError]=useState('');
  const [emailSuccess,setEmailSuccess]=useState('');
  const [sessions,setSessions]=useState<AccountSession[]>([]);
  const [sessionState,setSessionState]=useState<'loading'|'ready'|'error'>('loading');
  const [sessionError,setSessionError]=useState('');
  const [sessionSuccess,setSessionSuccess]=useState('');
  const [confirmation,setConfirmation]=useState<Confirmation|null>(null);
  const [busy,setBusy]=useState<'password'|'email'|'session'|null>(null);
  const operation=useRef(false);
  const sessionRequest=useRef(0);
  const confirmationButton=useRef<HTMLButtonElement>(null);
  const passwordButton=useRef<HTMLButtonElement>(null);
  const cancelFocus=useRef<HTMLElement|null>(null);
  const restoreFocus=useRef(false);

  useEffect(()=>{
    if(confirmation)confirmationButton.current?.focus();
    else if(restoreFocus.current){
      (cancelFocus.current?.isConnected?cancelFocus.current:passwordButton.current)?.focus();
      restoreFocus.current=false;
    }
  },[confirmation]);
  async function loadSessions(){
    const requestId=++sessionRequest.current;
    setSessionState('loading');setSessionError('');setSessionSuccess('');
    try{
      const result=await apiGet<AccountSession[]>('/auth/sessions');
      if(requestId!==sessionRequest.current)return;
      setSessions(listData<AccountSession>(result));setSessionState('ready');
    }catch(cause){
      if(requestId!==sessionRequest.current)return;
      setSessionState('error');setSessionError(message(cause,'Не удалось загрузить сеансы. Повторите запрос.'));
    }
  }
  useEffect(()=>{void loadSessions();return()=>{sessionRequest.current++}},[]);

  function confirm(next:Confirmation){cancelFocus.current=document.activeElement as HTMLElement|null;setConfirmation(next)}
  function cancel(){restoreFocus.current=true;setConfirmation(null)}
  function preparePassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(operation.current)return;
    setPasswordError('');
    if(!validPassword(currentPassword)||!validPassword(newPassword)){setPasswordError('Текущий и новый пароли должны содержать от 8 до 128 символов.');return}
    if(newPassword!==passwordConfirmation){setPasswordError('Пароли не совпадают. Повторите новый пароль.');return}
    confirm({kind:'password'});
  }
  async function changePassword(){
    if(operation.current)return;
    operation.current=true;setBusy('password');setPasswordError('');
    try{
      await apiPost('/auth/change-password',{currentPassword,newPassword});
    }catch(cause){
      setPasswordError(message(cause,'Не удалось сменить пароль. Попробуйте ещё раз.'));
      setConfirmation(null);operation.current=false;setBusy(null);
      return;
    }
    // The server has already changed the password. Logout errors must never
    // be reported as a failed password change or invite an old-password retry.
    setCurrentPassword('');setNewPassword('');setPasswordConfirmation('');setConfirmation(null);
    try{
      await onLogout();
    }catch{
      setPasswordError('Пароль успешно изменён, но автоматический выход не удался. Выйдите из аккаунта вручную и войдите с новым паролем.');
    }finally{operation.current=false;setBusy(null)}
  }
  async function requestEmailChange(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(operation.current)return;
    setEmailError('');setEmailSuccess('');
    const normalizedEmail=newEmail.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)||normalizedEmail.length>254){setEmailError('Укажите корректный новый email.');return}
    if(normalizedEmail===email.trim().toLowerCase()){setEmailError('Новый email совпадает с текущим.');return}
    if(!validPassword(emailPassword)){setEmailError('Текущий пароль должен содержать от 8 до 128 символов.');return}
    operation.current=true;setBusy('email');setConfirmation(null);
    try{
      await apiPost('/auth/request-email-change',{email:normalizedEmail,currentPassword:emailPassword});
      setEmailPassword('');setNewEmail(normalizedEmail);
      setEmailSuccess(`Запрос на письмо для ${normalizedEmail} принят. Откройте ссылку в течение 30 минут. Доставка письма пока не подтверждена; проверьте также папку «Спам». До подтверждения действует текущий email.`);
    }catch(cause){setEmailError(message(cause,'Не удалось запросить смену email. Попробуйте ещё раз.'))}
    finally{operation.current=false;setBusy(null)}
  }
  async function revokeSessions(target:Confirmation){
    if(operation.current||target.kind==='password')return;
    operation.current=true;setBusy('session');setSessionError('');setSessionSuccess('');
    try{
      await apiDelete(target.kind==='all'?'/auth/sessions':'/auth/sessions/'+encodeURIComponent(target.session.id));
      // A list requested before this mutation must not restore a revoked row.
      sessionRequest.current++;setSessionState('ready');
      setConfirmation(null);
      if(target.kind==='all'){setSessions([]);await onLogout()}
      else{
        setSessions(previous=>previous.filter(session=>session.id!==target.session.id));
        setSessionSuccess('Сеанс завершён. На выбранном устройстве потребуется войти снова после окончания текущего доступа.');
      }
    }catch(cause){setSessionError(message(cause,'Не удалось завершить сеанс. Попробуйте ещё раз.'));setConfirmation(null)}
    finally{operation.current=false;setBusy(null)}
  }
  const error=(text:string)=>text&&<p className="account-security-feedback is-error" role="alert"><AlertTriangle size={17}/><span>{text}</span></p>;

  return <section className="participant-account-security" aria-labelledby="account-security-heading">
    <header className="account-security-heading"><span className="account-security-mark"><ShieldCheck size={24}/></span><div><span className="eyebrow">ДОСТУП К USD</span><h2 id="account-security-heading">Безопасность аккаунта</h2><p>Управляйте входом, почтой и устройствами в одном месте.</p></div></header>
    <div className="account-security-grid">
      <article className="account-security-card">
        <div className="account-security-card-title"><KeyRound size={20}/><h3>Пароль</h3></div>
        <p className="account-security-copy">После смены пароля вы выйдете из аккаунта на этом устройстве. На остальных устройствах потребуется повторный вход после окончания текущего доступа.</p>
        <form id="account-password-form" onSubmit={preparePassword} noValidate aria-busy={busy==='password'}>
          <fieldset disabled={busy!==null}>
            <label htmlFor="account-current-password">Текущий пароль<input id="account-current-password" type="password" autoComplete="current-password" minLength={8} maxLength={128} required value={currentPassword} onChange={event=>{setCurrentPassword(event.target.value);setConfirmation(null)}}/></label>
            <label htmlFor="account-new-password">Новый пароль<input id="account-new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required aria-describedby="account-password-hint" value={newPassword} onChange={event=>{setNewPassword(event.target.value);setConfirmation(null)}}/></label>
            <small id="account-password-hint">От 8 до 128 символов. Используйте отдельный пароль для USD.</small>
            <label htmlFor="account-password-confirmation">Повторите новый пароль<input id="account-password-confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={passwordConfirmation} onChange={event=>{setPasswordConfirmation(event.target.value);setConfirmation(null)}}/></label>
          </fieldset>
          {error(passwordError)}
          {confirmation?.kind==='password'?<div className="account-security-confirm" role="group" aria-label="Подтверждение смены пароля"><strong>Сменить пароль и завершить все сеансы?</strong><p>Вам потребуется войти с новым паролем, в том числе на этом устройстве.</p><div><button type="button" className="secondary-button" disabled={busy!==null} onClick={cancel}>Отмена</button><button ref={confirmationButton} type="button" className="primary-button" disabled={busy!==null} onClick={()=>void changePassword()}>{busy==='password'?'Меняем пароль…':'Сменить пароль и выйти'}</button></div></div>
            :<button ref={passwordButton} type="submit" className="secondary-button" disabled={busy!==null}>Сменить пароль</button>}
        </form>
      </article>
      <article className="account-security-card">
        <div className="account-security-card-title"><Mail size={20}/><h3>Электронная почта</h3></div>
        <p className="account-security-email"><span>Текущий email</span><strong>{email}</strong></p>
        <p className="account-security-copy">Подтвердите новый адрес по ссылке из письма в течение 30 минут. После подтверждения потребуется войти заново.</p>
        <form id="account-email-form" onSubmit={requestEmailChange} noValidate aria-busy={busy==='email'}>
          <fieldset disabled={busy!==null}>
            <label htmlFor="account-new-email">Новый email<input id="account-new-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required value={newEmail} onChange={event=>{setNewEmail(event.target.value);setEmailSuccess('')}}/></label>
            <label htmlFor="account-email-password">Текущий пароль<input id="account-email-password" type="password" autoComplete="current-password" minLength={8} maxLength={128} required value={emailPassword} onChange={event=>setEmailPassword(event.target.value)}/></label>
          </fieldset>
          {error(emailError)}
          {emailSuccess&&<p className="account-security-feedback is-success" role="status"><CheckCircle2 size={17}/><span>{emailSuccess}</span></p>}
          <button type="submit" className="secondary-button" disabled={busy!==null}>{busy==='email'?'Отправляем…':'Запросить смену email'}</button>
        </form>
      </article>
    </div>
    <article className="account-security-card account-security-sessions">
      <div className="account-security-sessions-heading"><div className="account-security-card-title"><Smartphone size={20}/><h3>Сеансы входа</h3></div><button type="button" className="secondary-button compact" onClick={()=>void loadSessions()} disabled={busy!==null||sessionState==='loading'}><RefreshCw size={15}/>Обновить сеансы</button></div>
      <p className="account-security-copy">Проверьте устройства, с которых выполнен вход. Любой сеанс в списке может относиться к этому устройству. После завершения сеанса повторный вход потребуется, когда закончится текущий доступ.</p>
      {sessionState==='loading'&&<p className="account-security-loading" role="status"><Loader2 size={18} className="spin"/>Загружаем сеансы…</p>}
      {error(sessionError)}
      {sessionSuccess&&<p className="account-security-feedback is-success" role="status"><CheckCircle2 size={17}/><span>{sessionSuccess}</span></p>}
      {sessionState==='ready'&&(sessions.length?<ul className="account-security-session-list">{sessions.map(session=><li key={session.id}><div className="account-security-session-device"><Smartphone size={19}/><div><strong>{session.userAgent||'Неизвестное устройство'}</strong><span>IP: {session.ipAddress||'Не указан'}</span></div></div><dl><div><dt>Последняя активность</dt><dd>{date(session.updatedAt)}</dd></div><div><dt>Вход выполнен</dt><dd>{date(session.createdAt)}</dd></div><div><dt>Действует до</dt><dd>{date(session.expiresAt)}</dd></div></dl><button type="button" className="secondary-button compact" aria-label={'Завершить сеанс: '+(session.userAgent||'Неизвестное устройство')} disabled={busy!==null} onClick={()=>{setSessionError('');confirm({kind:'session',session})}}>Завершить сеанс</button></li>)}</ul>:<div className="account-security-empty"><ShieldCheck size={24}/><strong>Активных сеансов нет</strong><p>При следующем входе здесь появится устройство.</p></div>)}
      {confirmation&&confirmation.kind!=='password'&&<div className="account-security-confirm" role="group" aria-label="Подтверждение завершения сеансов"><strong>{confirmation.kind==='all'?'Завершить все сеансы и выйти?':'Завершить выбранный сеанс?'}</strong><p>{confirmation.kind==='all'?'Вы выйдете из аккаунта на этом устройстве. Подготовьте пароль для повторного входа.':`Устройство: ${confirmation.session.userAgent||'Неизвестное устройство'}. Если это ваше устройство, потребуется повторный вход после окончания текущего доступа.`}</p><div><button type="button" className="secondary-button" disabled={busy!==null} onClick={cancel}>Отмена</button><button ref={confirmationButton} type="button" className="primary-button" disabled={busy!==null} onClick={()=>void revokeSessions(confirmation)}>{busy==='session'?'Завершаем…':confirmation.kind==='all'?'Да, завершить все и выйти':'Да, завершить сеанс'}</button></div></div>}
      <div className="account-security-session-footer"><p>Не узнаёте устройство? Завершите его сеанс и смените пароль.</p><button type="button" className="secondary-button" disabled={busy!==null||sessionState!=='ready'||sessions.length===0} onClick={()=>{setSessionError('');confirm({kind:'all'})}}>Завершить все сеансы</button></div>
    </article>
  </section>;
}
