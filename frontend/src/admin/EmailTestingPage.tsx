import {useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,Clock3,Mail,Send,ShieldAlert} from 'lucide-react';
import {apiGet,apiPost,listData} from '../api';

const triggerTypes=[
 {value:'STAGE_REGISTRATION_OPEN',label:'Открытие регистрации',description:'Письмо о том, что регистрация на опубликованный этап открыта.'},
 {value:'REGISTRATION_CONFIRMED',label:'Подтверждение регистрации',description:'Подтверждение заявки участника на этап.'},
 {value:'STAGE_REMINDER_3D',label:'Напоминание за 3 дня',description:'Автоматическое письмо участникам за три календарных дня до этапа.'},
 {value:'STAGE_REMINDER_1D',label:'Напоминание за 1 день',description:'Автоматическое письмо участникам за один календарный день до этапа.'},
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
 const[email,setEmail]=useState(''),[type,setType]=useState(triggerTypes[0].value),[stageId,setStageId]=useState(''),[stages,setStages]=useState<any[]>([]),[loadingStages,setLoadingStages]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[lastResult,setLastResult]=useState<any>(null);
 useEffect(()=>{let active=true;apiGet<any>('/stages').then(r=>{if(active)setStages(listData(r).filter((s:any)=>!s.isDeleted))}).catch(()=>{if(active)setStages([])}).finally(()=>{if(active)setLoadingStages(false)});return()=>{active=false}},[]);
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
  }finally{setSending(false);}
 };
 return <PageFrame title="Тестирование писем" subtitle="Отдельная рабочая страница для проверки почтового провайдера и шаблонов уведомлений USD">
  <div className="settings-section">
   <PanelTitle title="Отправка тестового шаблона" icon={Mail}/>
   <p className="settings-help">Письмо отправляется только на указанный адрес. Эта проверка не регистрирует участников и не запускает массовую рассылку. Ответ провайдера подтверждает принятие запроса, но не фактическую доставку.</p>
   <div className="settings-form-grid">
    <label><span className="field-label">Тестовый email</span><input type="email" autoComplete="email" maxLength={300} required aria-invalid={Boolean(email)&&!emailValid} value={email} onChange={e=>{setEmail(e.target.value);setError('');setNotice('')}} placeholder="Укажите свой почтовый ящик"/><small className="field-help">{email&&!emailValid?'Введите адрес в формате name@example.com без пробелов.':'После отправки проверьте «Входящие», «Спам» и журнал почтового провайдера.'}</small></label>
    <label><span className="field-label">Тип письма</span><select value={type} onChange={e=>{setType(e.target.value);setError('');setNotice('')}}>{triggerTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select><small className="field-help">{selected.description}</small></label>
    <label><span className="field-label">Этап для примера в письме</span><select value={stageId} onChange={e=>setStageId(e.target.value)} disabled={loadingStages}><option value="">Без выбранного этапа</option>{stages.map((s:any)=><option key={s.id} value={s.id}>{s.name||('Этап №'+s.stageNumber)} · {s.city||'город не указан'}</option>)}</select><small className="field-help">Выбор этапа влияет только на текст тестового письма.</small></label>
   </div>
   {error&&<div className="notice" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
   {notice&&<div className="notice" role="status"><CheckCircle2 size={16}/><span>{notice}</span></div>}
   {lastResult&&<div className="mail-test-result"><strong>Статус запроса</strong><p>Тип: {selected.label}</p><p>Получатель: {normalizedEmail}</p><p>Провайдер принял запрос: {lastResult.providerAccepted?'да':'нет'}</p><p>Доставка подтверждена системой: {lastResult.deliveryConfirmed?'да':'нет'}</p></div>}
   <div className="button-row"><button className="primary-button" onClick={()=>void send()} disabled={sending||!emailValid}>{sending?<><span className="spin">◌</span> Отправляем…</>:<><Send size={15}/> Отправить тестовое письмо</>}</button></div>
  </div>
  <div className="settings-section">
   <PanelTitle title="Как проверить автоматические триггеры" icon={Clock3}/>
   <ol className="mail-test-steps">
    <li><strong>Сначала проверьте шаблоны выше.</strong> Это безопасная отправка на ваш адрес, без писем участникам.</li>
    <li><strong>Триггеры по датам проверяются автоматически.</strong> Фоновая проверка выполняется при старте backend и далее каждые 15 минут. Напоминания отправляются при совпадении календарной даты этапа с датой «через 3 дня» или «через 1 день».</li>
    <li><strong>Для проверки даты используйте только отдельный тестовый этап.</strong> Изменение даты реального этапа может отправить письма всем зарегистрированным участникам; открытие регистрации может затронуть пользователей с активным согласием на новости. Не меняйте даты боевого этапа ради теста.</li>
    <li><strong>После изменения даты подождите до 15 минут</strong> и проверьте журнал провайдера и почтовые ящики тестовых участников. Для точного теста напоминаний на тестовом этапе нужны тестовые регистрации с контролируемыми адресами.</li>
   </ol>
   <div className="notice"><ShieldAlert size={16}/><span>Системная защита от повторов сохраняется. Повторная отправка одного и того же автоматического события не гарантируется, если его ключ уже записан в журнале.</span></div>
  </div>
 </PageFrame>;
}
