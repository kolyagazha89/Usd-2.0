import {useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,Clock3,Mail,Send,ShieldAlert} from 'lucide-react';
import {apiGet,apiPost,listData} from '../api';

const triggerTypes=[
 {value:'STAGE_REGISTRATION_OPEN',label:'Открытие регистрации',description:'Письмо о том, что регистрация на опубликованный этап открыта.'},
 {value:'REGISTRATION_CONFIRMED',label:'Подтверждение регистрации',description:'Подтверждение заявки участника на этап.'},
 {value:'STAGE_REMINDER_3D',label:'Напоминание за 3 дня',description:'Автоматическое письмо участникам за три календарных дня до этапа.'},
 {value:'STAGE_REMINDER_1D',label:'Напоминание за 1 день',description:'Автоматическое письмо участникам за один календарный день до этапа.'},
 {value:'AUTH_EMAIL_VERIFICATION',label:'Подтверждение email аккаунта',description:'Системное письмо для подтверждения адреса при создании аккаунта.'},
 {value:'AUTH_PASSWORD_RESET',label:'Восстановление пароля',description:'Системное письмо со ссылкой для восстановления доступа к аккаунту.'},
 {value:'AUTH_EMAIL_CHANGE',label:'Подтверждение нового email',description:'Системное письмо для подтверждения смены адреса электронной почты.'},
];

// Remove invisible formatting characters that can be introduced by copying an address.
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
 const[mailStatus,setMailStatus]=useState<{provider:string;ready:boolean;missing:string[];note:string}|null>(null),[mailStatusError,setMailStatusError]=useState(false),[mailStatusLoading,setMailStatusLoading]=useState(false);
 const[email,setEmail]=useState(''),[type,setType]=useState('AUTH_EMAIL_VERIFICATION'),[stageId,setStageId]=useState(''),[stages,setStages]=useState<any[]>([]),[loadingStages,setLoadingStages]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[lastResult,setLastResult]=useState<any>(null);
 useEffect(()=>{let active=true;apiGet<any>('/stages').then(r=>{if(active)setStages(listData(r).filter((s:any)=>!s.isDeleted))}).catch(()=>{if(active)setStages([])}).finally(()=>{if(active)setLoadingStages(false)});return()=>{active=false}},[]);
 const checkMailChannel=async()=>{setMailStatusLoading(true);setMailStatusError(false);try{const info=await apiGet<{provider:string;ready:boolean;missing:string[];note:string}>('/mail/status');if(!info||typeof info.provider!=='string'||!Array.isArray(info.missing)||typeof info.note!=='string')throw new Error('Некорректный ответ диагностики почты');setMailStatus(info)}catch{setMailStatus(null);setMailStatusError(true)}finally{setMailStatusLoading(false)}};
 useEffect(()=>{void checkMailChannel()},[]);
 const selected=triggerTypes.find(t=>t.value===type)??triggerTypes[0];
 const normalizedEmail=normalizeEmail(email);
 const emailValid=isPlausibleEmail(normalizedEmail);
 const send=async()=>{
  if(!emailValid){setError('Проверьте адрес: введите email в формате name@example.com без пробелов.');return;}
  setSending(true);setError('');setNotice('');setLastResult(null);
  try{
   const result=await apiPost<any>('/mail/test-trigger',{email:normalizedEmail,type,stageId:stageId||undefined});
   setLastResult(result);setNotice(result?.message||'Провайдер принял тестовый запрос. Проверьте входящие и папку «Спам».');
  }catch(e){
   const message=e instanceof Error?e.message:'Не удалось отправить тестовый шаблон';
   setError(message.includes('корректный email')?'Сервер отклонил адрес. Проверьте, нет ли скрытых символов или пробелов, и попробуйте ввести email вручную.':message);
  }finally{setSending(false);void checkMailChannel();}
 };
 return <PageFrame title="Тестирование писем" subtitle="Отдельная рабочая страница для проверки почтового провайдера и шаблонов уведомлений USD">
  <div className="settings-section">
   <PanelTitle title="Отправка тестового шаблона" icon={Mail}/>
   <div className={'mail-channel-status '+(mailStatus?.ready?'ready':mailStatus?'needs-setup':'unknown')} role="status">
    <div><strong>Почтовый канал: {mailStatus?.provider??'проверяем'}</strong><button className="secondary-button compact" type="button" disabled={mailStatusLoading} onClick={()=>void checkMailChannel()}>{mailStatusLoading?'Проверяем…':'Проверить настройки'}</button></div>
    {mailStatus&&<><p>{mailStatus.note}</p>{mailStatus.missing.length>0&&<p><b>Нужно настроить на сервере:</b> {mailStatus.missing.join(', ')}</p>}</>}
    {mailStatusError&&<p>Диагностика почтового канала сейчас недоступна. Возможно, новая версия API ещё не опубликована.</p>}
    {mailStatus?.ready&&<small>Готовность означает только наличие параметров, а не успешную доставку. Запустите тест ниже.</small>}
    {mailStatus&&!mailStatus.ready&&<small>Отправка заблокирована до устранения перечисленных настроек. Пароль приложения вводится только в окружении Ubuntu, не в браузере.</small>}
   </div>
   <p className="settings-help">Письмо отправляется только на указанный адрес. Эта проверка не регистрирует участников и не запускает массовую рассылку. Ответ провайдера подтверждает принятие запроса, но не фактическую доставку.</p>
   <div className="settings-form-grid">
    <label><span className="field-label">Тестовый email</span><input type="email" autoComplete="email" maxLength={300} required aria-invalid={Boolean(email)&&!emailValid} value={email} onChange={e=>{setEmail(e.target.value);setError('');setNotice('')}} placeholder="Укажите свой почтовый ящик"/><small className="field-help">{email&&!emailValid?'Введите адрес в формате name@example.com без пробелов.':'После отправки проверьте «Входящие», «Спам» и журнал почтового провайдера.'}</small></label>
    <label><span className="field-label">Тип письма</span><select value={type} onChange={e=>{setType(e.target.value);setError('');setNotice('')}}>{triggerTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select><small className="field-help">{selected.description}</small></label>
    <label><span className="field-label">Этап для примера в письме</span><select value={stageId} onChange={e=>setStageId(e.target.value)} disabled={loadingStages}><option value="">Без выбранного этапа</option>{stages.map((s:any)=><option key={s.id} value={s.id}>{s.name||('Этап №'+s.stageNumber)} · {s.city||'город не указан'}</option>)}</select><small className="field-help">Выбор этапа влияет только на текст тестового письма.</small></label>
   </div>
   {error&&<div className="notice" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
   {notice&&<div className="notice" role="status"><CheckCircle2 size={16}/><span>{notice}</span></div>}
   {lastResult&&<div className="mail-test-result"><strong>Статус запроса</strong><p>Тип: {selected.label}</p><p>Получатель: {normalizedEmail}</p><p>Провайдер принял запрос: {lastResult.providerAccepted?'да':'нет'}</p><p>Доставка подтверждена системой: {lastResult.deliveryConfirmed?'да':'нет'}</p></div>}
   <div className="button-row"><button className="primary-button" onClick={()=>void send()} disabled={sending||!emailValid||mailStatus?.ready===false}>{sending?<><span className="spin">◌</span> Отправляем…</>:<><Send size={15}/> Отправить тестовое письмо</>}</button></div>
  </div>
  <div className="settings-section">
   <PanelTitle title="Как проверить автоматические триггеры" icon={Clock3}/>
   <ol className="mail-test-steps">
    <li><strong>Сначала проверьте шаблоны выше.</strong> Это безопасная отправка на ваш адрес, без писем участникам.</li>
    <li><strong>Обычная Яндекс Почта — только письма аккаунта.</strong> При MAIL_ACCOUNT_ONLY=true автоматические письма об этапах и напоминания отключены: для них используются PUSH. Ручное тестирование шаблонов выше по-прежнему доступно. Если администратор отдельно включит полноценную почтовую рассылку, напоминания проверяются фоновым процессом раз в 15 минут.</li>
    <li><strong>Для проверки даты используйте только отдельный тестовый этап.</strong> Изменение даты реального этапа может отправить письма всем зарегистрированным участникам; открытие регистрации может затронуть пользователей с активным согласием на новости. Не меняйте даты боевого этапа ради теста.</li>
    <li><strong>Не изменяйте реальный этап ради проверки.</strong> Для рассылки по датам после её отдельного включения используйте тестовый этап и тестовые регистрации с контролируемыми адресами. При MAIL_ACCOUNT_ONLY=true отправок по датам не будет.</li>
   </ol>
   <div className="notice"><ShieldAlert size={16}/><span>Системная защита от повторов сохраняется. Повторная отправка одного и того же автоматического события не гарантируется, если его ключ уже записан в журнале.</span></div>
  </div>
 </PageFrame>;
}
