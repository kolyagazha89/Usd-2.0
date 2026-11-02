import {useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,Mail,Send,ShieldCheck} from 'lucide-react';
import {apiGet,apiPost} from '../api';

type MailStatus={provider:string;ready:boolean;missing:string[];note:string};
const templates=[
 {value:'AUTH_EMAIL_VERIFICATION',label:'Подтверждение email',description:'Тест без настоящей ссылки подтверждения и без регистрации аккаунта.'},
 {value:'AUTH_PASSWORD_RESET',label:'Восстановление пароля',description:'Тест без настоящего токена и без изменения пароля.'},
 {value:'AUTH_EMAIL_CHANGE',label:'Смена email',description:'Тест без изменения адреса аккаунта.'},
];
function normalizeEmail(value:string){return value.replace(/[\u200B-\u200D\uFEFF]/g,'').trim();}
function isPlausibleEmail(value:string){
 if(!value||value.length>254||/\s/.test(value)||/[<>(),;:"\\]/.test(value)||value.includes('[')||value.includes(']'))return false;
 const parts=value.split('@');
 if(parts.length!==2)return false;
 const [local,domain]=parts;
 if(!local||local.length>64||!domain||domain.length>253||local.startsWith('.')||local.endsWith('.')||local.includes('..'))return false;
 const labels=domain.split('.');
 return labels.length>=2&&labels.every(label=>label.length>0&&label.length<=63&&!label.startsWith('-')&&!label.endsWith('-'))&&/^[^@]+$/.test(local)&&labels[labels.length-1].length>=2;
}

export default function EmailTestingPage({PageFrame,PanelTitle}:{PageFrame:React.ComponentType<any>;PanelTitle:React.ComponentType<any>}){
 const[status,setStatus]=useState<MailStatus|null>(null),[statusError,setStatusError]=useState(false),[checking,setChecking]=useState(false);
 const[email,setEmail]=useState(''),[type,setType]=useState(templates[0].value),[sending,setSending]=useState(false),[connecting,setConnecting]=useState(false);
 const[error,setError]=useState(''),[notice,setNotice]=useState(''),[connectionNotice,setConnectionNotice]=useState(''),[lastResult,setLastResult]=useState<any>(null);
 const refreshStatus=async()=>{
  setChecking(true);setStatusError(false);
  try{
   const info=await apiGet<MailStatus>('/mail/status');
   if(!info||typeof info.provider!=='string'||!Array.isArray(info.missing)||typeof info.note!=='string')throw new Error('Некорректный ответ');
   setStatus(info);
  }catch{setStatus(null);setStatusError(true)}
  finally{setChecking(false)}
 };
 useEffect(()=>{void refreshStatus()},[]);
 const selected=templates.find(t=>t.value===type)??templates[0];
 const normalizedEmail=normalizeEmail(email),emailValid=isPlausibleEmail(normalizedEmail);
 const checkConnection=async()=>{
  setError('');setConnectionNotice('');setConnecting(true);
  try{
   const result=await apiPost<{message:string}>('/mail/check-connection',{});
   setConnectionNotice(result.message);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось проверить SMTP-соединение')}
  finally{setConnecting(false);void refreshStatus()}
 };
 const send=async()=>{
  if(!emailValid){setError('Введите корректный email без пробелов.');return}
  setSending(true);setError('');setNotice('');setLastResult(null);
  try{
   const result=await apiPost<any>('/mail/test-trigger',{email:normalizedEmail,type});
   setLastResult(result);
   setNotice(result?.message||'Провайдер принял запрос. Проверьте почту.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось отправить тестовое письмо')}
  finally{setSending(false);void refreshStatus()}
 };
 return <PageFrame title="Тестирование писем" subtitle="Релизный почтовый канал USD · только обязательные письма аккаунта">
  <div className="settings-section">
   <PanelTitle title="Яндекс Почта — состояние подключения" icon={Mail}/>
   <div className={'mail-channel-status '+(status?.ready?'ready':status?'needs-setup':'unknown')} role="status">
    <div><strong>{status?.provider??'Проверяем почту'}</strong><button type="button" className="secondary-button compact" disabled={checking} onClick={()=>void refreshStatus()}>{checking?'Проверяем…':'Обновить статус'}</button></div>
    {status&&<><p>{status.note}</p>{status.missing.length>0&&<p><b>Нужно настроить на Ubuntu:</b> {status.missing.join(', ')}</p>}</>}
    {statusError&&<p>Диагностика недоступна. Проверьте API и опубликованную версию.</p>}
    {status?.ready&&<small>Настройки заполнены, но соединение с SMTP и доставка писем пока не проверены.</small>}
   </div>
   <p className="settings-help">В релизе через почту отправляем только подтверждение email, восстановление пароля и смену адреса. Анонсы, напоминания и события этапов отправляются через PUSH, без массовых email-рассылок.</p>
   <div className="button-row"><button type="button" className="secondary-button" disabled={!status?.ready||connecting} onClick={()=>void checkConnection()}><ShieldCheck size={16}/>{connecting?'Проверяем SMTP…':'Проверить SMTP и пароль приложения'}</button></div>
   {connectionNotice&&<div className="notice" role="status"><CheckCircle2 size={16}/><span>{connectionNotice}</span></div>}
  </div>
  <div className="settings-section">
   <PanelTitle title="Безопасное тестовое письмо" icon={Send}/>
   <p className="settings-help">Тест можно отправить на любой ваш почтовый ящик, даже если аккаунта USD с таким адресом нет. Тест не создаёт токены и не меняет данные аккаунтов. Для проверки настоящего восстановления используйте подтверждённый аккаунт USD.</p>
   <div className="settings-form-grid">
    <label><span className="field-label">Тестовый email</span><input type="email" autoComplete="email" maxLength={254} value={email} aria-invalid={Boolean(email)&&!emailValid} onChange={e=>{setEmail(e.target.value);setError('');setNotice('')}} placeholder="Ваш почтовый адрес"/><small className="field-help">После отправки проверьте «Входящие» и «Спам».</small></label>
    <label><span className="field-label">Тип письма</span><select value={type} onChange={e=>{setType(e.target.value);setError('');setNotice('')}}>{templates.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select><small className="field-help">{selected.description}</small></label>
   </div>
   {error&&<div className="notice" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
   {notice&&<div className="notice" role="status"><CheckCircle2 size={16}/><span>{notice}</span></div>}
   {lastResult&&<div className="mail-test-result"><strong>Результат проверки</strong><p>Получатель: {normalizedEmail}</p><p>Провайдер принял запрос: {lastResult.providerAccepted?'да':'нет'}</p><p>Доставка подтверждена: {lastResult.deliveryConfirmed?'да':'нет — проверьте почтовый ящик'}</p></div>}
   <div className="button-row"><button type="button" className="primary-button" onClick={()=>void send()} disabled={sending||!emailValid||!status?.ready}>{sending?'Отправляем…':<><Send size={15}/> Отправить тест</>}</button></div>
  </div>
  <div className="settings-section">
   <PanelTitle title="Проверка перед релизом" icon={ShieldCheck}/>
   <ol className="mail-test-steps">
    <li>Проверьте настройки канала и включённый SMTP_EGRESS_ALLOWED.</li>
    <li>Проверьте соединение и пароль приложения — это не гарантирует доставку.</li>
    <li>Отправьте тестовое письмо и убедитесь, что оно действительно пришло.</li>
    <li>Проверьте регистрацию нового аккаунта, подтверждение email и настоящее восстановление пароля для существующего подтверждённого аккаунта.</li>
   </ol>
  </div>
 </PageFrame>;
}
