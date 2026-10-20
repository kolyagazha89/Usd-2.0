import {useRef,useState,type FormEvent} from 'react';
import {AlertTriangle,CheckCircle2,ChevronRight} from 'lucide-react';
import {apiPost} from './api';

export type AccountAction = 'reset-password' | 'confirm-email-change';

export default function AccountActionPage({action,path,onGoLogin,onSessionReset}:{
  action:AccountAction;
  path:string;
  onGoLogin:()=>void;
  onSessionReset:()=>void;
}){
  const token=new URLSearchParams(path.split('?')[1]??'').get('token')?.trim()??'';
  const validToken=/^[a-f0-9]{64}$/i.test(token);
  const resetting=action==='reset-password';
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [error,setError]=useState('');
  const [success,setSuccess]=useState(false);
  const [loading,setLoading]=useState(false);
  const submitting=useRef(false);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!validToken||submitting.current||success)return;
    setError('');
    if(resetting){
      if(password.length<8||password.length>128){setError('Пароль должен содержать от 8 до 128 символов');return;}
      if(password!==confirmation){setError('Пароли не совпадают');return;}
    }
    submitting.current=true;
    setLoading(true);
    try{
      await apiPost('/auth/'+action,resetting?{token,password}:{token});
      setPassword('');
      setConfirmation('');
      onSessionReset();
      setSuccess(true);
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Не удалось выполнить запрос. Попробуйте ещё раз.');
    }finally{
      submitting.current=false;
      setLoading(false);
    }
  }

  return <div className="login-page"><div className="login-grid"/><div className="login-card">
    <div className="brand-lockup"><div className="brand-mark">USD</div></div>
    <h1>{success?(resetting?'Пароль изменён':'Email изменён'):(resetting?'Новый пароль':'Подтверждение нового email')}</h1>
    {success?<div className="notice" role="status"><CheckCircle2 size={18}/><span>{resetting?'Пароль успешно изменён. Войдите с новым паролем.':'Email успешно изменён. Войдите с новым адресом.'}</span></div>
      :!validToken?<div className="form-error" role="alert"><AlertTriangle size={18}/><span>Ссылка недействительна. {resetting?'Вернитесь ко входу, нажмите «Забыли пароль?» и запросите новое письмо.':'Запросите новое письмо в настройках аккаунта и откройте ссылку из него.'}</span></div>
      :<><p className="muted">{resetting?'Укажите новый пароль для аккаунта USD. Ссылка действует 30 минут.':'Нажмите кнопку, чтобы подтвердить новый адрес. Ссылка действует 30 минут.'}</p>
        <form className="form" onSubmit={submit} aria-busy={loading}>
          {resetting&&<><label htmlFor="recovery-password">Новый пароль<input id="recovery-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} disabled={loading} required/></label>
          <label htmlFor="recovery-confirmation">Повторите пароль<input id="recovery-confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={loading} required/></label></>}
          {error&&<div className="form-error" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
          <button className="primary-button" type="submit" disabled={loading}>{loading?'Сохраняем…':resetting?'Сохранить пароль':'Подтвердить новый email'}<ChevronRight size={18}/></button>
        </form>
      </>}
    <button type="button" className={success?'primary-button':'text-button login-mode-toggle'} onClick={onGoLogin} disabled={loading}>{success?'Войти':'Вернуться ко входу'}</button>
  </div></div>;
}
