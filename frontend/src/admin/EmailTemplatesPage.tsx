import {useEffect,useMemo,useRef,useState} from 'react';
import {CheckCircle2,CopyPlus,Mail,Save,Send,Trash2} from 'lucide-react';
import {apiGet,apiPost,updateSiteSettings} from '../api';

type EmailVariableTexts={heading:string;intro:string;detailsBefore:string;detailsAfter:string};
type EmailTemplate={id:string;name:string;trigger:string;enabled:boolean;subject:string;body:string;footer:string;buttonLabel:string;variableTexts?:Partial<EmailVariableTexts>};
const triggers=[
 {value:'STAGE_REGISTRATION_OPEN',label:'Открытие регистрации'},
 {value:'REGISTRATION_CONFIRMED',label:'Подтверждение регистрации'},
 {value:'STAGE_REMINDER_3D',label:'Напоминание за 3 дня'},
 {value:'STAGE_REMINDER_1D',label:'Напоминание за 1 день'},
 {value:'AUTH_EMAIL_VERIFICATION',label:'Подтверждение email аккаунта'},
 {value:'AUTH_PASSWORD_RESET',label:'Восстановление пароля'},
 {value:'AUTH_EMAIL_CHANGE',label:'Подтверждение нового email'},
];
const starterTemplates:EmailTemplate[]=[
 {id:'stage-registration-open',name:'Открытие регистрации',trigger:'STAGE_REGISTRATION_OPEN',enabled:true,subject:'Открыта регистрация: {{heading}} — ЮСД',body:'{{intro}}\n\n{{details}}',footer:'Это информационное сообщение ЮСД о соревнованиях. Вы получили его в связи с настройками уведомлений.',buttonLabel:'Открыть ЮСД',variableTexts:{heading:'',intro:'',detailsBefore:'',detailsAfter:''}},
 {id:'registration-confirmed',name:'Подтверждение регистрации',trigger:'REGISTRATION_CONFIRMED',enabled:true,subject:'Заявка подтверждена: {{stageName}}',body:'{{intro}}\n\n{{details}}',footer:'Это сервисное сообщение ЮСД. Ответ почтового провайдера подтверждает принятие запроса, но не гарантирует попадание во входящие.',buttonLabel:'Открыть ЮСД'},
 {id:'stage-reminder-3d',name:'Напоминание за 3 дня',trigger:'STAGE_REMINDER_3D',enabled:true,subject:'Напоминание: {{heading}} — ЮСД',body:'{{intro}}\n\n{{details}}',footer:'Это сервисное сообщение ЮСД для зарегистрированных участников.',buttonLabel:'Открыть ЮСД'},
 {id:'stage-reminder-1d',name:'Напоминание за 1 день',trigger:'STAGE_REMINDER_1D',enabled:true,subject:'Напоминание: {{heading}} — ЮСД',body:'{{intro}}\n\n{{details}}',footer:'Это сервисное сообщение ЮСД для зарегистрированных участников.',buttonLabel:'Открыть ЮСД'},
 {id:'auth-email-verification',name:'Подтверждение email аккаунта',trigger:'AUTH_EMAIL_VERIFICATION',enabled:true,subject:'Подтверждение email — ЮСД',body:'{{intro}}',footer:'Если вы не регистрировались в ЮСД, не переходите по ссылке. Она содержит персональный токен и не должна передаваться другим людям.',buttonLabel:'Подтвердить email',variableTexts:{heading:'',intro:'',detailsBefore:'',detailsAfter:''}},
 {id:'auth-password-reset',name:'Восстановление пароля',trigger:'AUTH_PASSWORD_RESET',enabled:true,subject:'Восстановление пароля — ЮСД',body:'{{intro}}',footer:'Если вы не запрашивали восстановление пароля, проигнорируйте письмо. Никому не сообщайте ссылку и токен.',buttonLabel:'Восстановить пароль',variableTexts:{heading:'',intro:'',detailsBefore:'',detailsAfter:''}},
 {id:'auth-email-change',name:'Подтверждение нового email',trigger:'AUTH_EMAIL_CHANGE',enabled:true,subject:'Подтверждение нового email — ЮСД',body:'{{intro}}',footer:'Ссылка действует 30 минут. Если вы не меняли email, не переходите по ссылке и обратитесь к администратору аккаунта.',buttonLabel:'Подтвердить новый email',variableTexts:{heading:'',intro:'',detailsBefore:'',detailsAfter:''}},
];
function makeId(){return 'email-template-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)}
function normalizeTemplate(t:any,i:number):EmailTemplate{return{id:String(t?.id||makeId()),name:String(t?.name||'Шаблон '+(i+1)),trigger:triggers.some(x=>x.value===t?.trigger)?t.trigger:triggers[0].value,enabled:t?.enabled!==false,subject:String(t?.subject||''),body:String(t?.body||'{{intro}}\n\n{{details}}'),footer:String(t?.footer||''),buttonLabel:String(t?.buttonLabel||'Открыть ЮСД'),variableTexts:{heading:String(t?.variableTexts?.heading??''),intro:String(t?.variableTexts?.intro??''),detailsBefore:String(t?.variableTexts?.detailsBefore??''),detailsAfter:String(t?.variableTexts?.detailsAfter??'')}}
function isActiveDuplicate(list:EmailTemplate[],current:EmailTemplate){return current.enabled&&list.some(t=>t.id!==current.id&&t.enabled&&t.trigger===current.trigger)}
export default function EmailTemplatesPage({PageFrame,PanelTitle}:{PageFrame:React.ComponentType<any>;PanelTitle:React.ComponentType<any>}){
 const[templates,setTemplates]=useState<EmailTemplate[]>(starterTemplates),[selectedId,setSelectedId]=useState('registration-confirmed'),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[testing,setTesting]=useState(false),[email,setEmail]=useState('kolyagazha89@gmail.com'),[message,setMessage]=useState(''),[error,setError]=useState('');
 const bodyRef=useRef<HTMLTextAreaElement|null>(null);
 useEffect(()=>{let alive=true;apiGet<any>('/site-settings').then(r=>{if(!alive)return;const raw=r?.settings?.registration?.emailTemplates;if(Array.isArray(raw)&&raw.length){setTemplates(raw.map(normalizeTemplate));if(!raw.some((t:any)=>t.id==='registration-confirmed'))setSelectedId(String(raw[0]?.id||''));}}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Не удалось загрузить шаблоны')}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[]);
 const selected=templates.find(t=>t.id===selectedId)??templates[0];
 const updateSelected=(patch:Partial<EmailTemplate>)=>{if(!selected)return;setTemplates(prev=>prev.map(t=>t.id===selected.id?{...t,...patch}:t));setMessage('');setError('')};
 const addTemplate=()=>{const trigger=triggers.find(t=>!templates.some(x=>x.trigger===t.value&&!x.enabled))?.value??triggers[0].value;const t:EmailTemplate={id:makeId(),name:'Новый шаблон',trigger,enabled:false,subject:'Уведомление ЮСД',body:'{{intro}}\n\n{{details}}',footer:'Это сообщение ЮСД.',buttonLabel:'Открыть ЮСД',variableTexts:{heading:'',intro:'',detailsBefore:'',detailsAfter:''}};setTemplates(prev=>[...prev,t]);setSelectedId(t.id);setMessage('');};
 const removeTemplate=()=>{if(!selected)return;if(starterTemplates.some(t=>t.id===selected.id)){setError('Первоначальные шаблоны системных писем нельзя удалять — их можно редактировать или отключать.');return;}setTemplates(prev=>prev.filter(t=>t.id!==selected.id));setSelectedId(templates.find(t=>t.id!==selected.id)?.id??'');setMessage('')};
 const save=async()=>{if(!selected)return;setError('');setMessage('');if(!selected.name.trim()||!selected.subject.trim()||!selected.body.trim()){setError('Заполните название, тему и основное тело письма.');return;}if(isActiveDuplicate(templates,selected)){setError('Для этого триггера уже включён другой шаблон. Отключите его перед включением текущего.');return;}setSaving(true);try{await updateSiteSettings({registration:{emailTemplates:templates}});setMessage('Шаблоны сохранены. Новые настройки будут применяться к следующим уведомлениям.');}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить шаблоны')}finally{setSaving(false)}};
 const test=async()=>{if(!selected||!email.trim()){setError('Укажите email для теста.');return;}setError('');setMessage('');setTesting(true);try{const r=await apiPost<any>('/mail/test-trigger',{email:email.trim(),type:selected.trigger});setMessage(r?.message||'Тестовый запрос передан почтовому провайдеру. Проверьте входящие и папку «Спам».')}catch(e){setError(e instanceof Error?e.message:'Не удалось отправить тест')}finally{setTesting(false)}};
 const preview=useMemo(()=>{if(!selected)return '';const vars=selected.variableTexts??{};const heading=vars.heading?.trim()||'Пример уведомления ЮСД';const intro=vars.intro?.trim()||'Текст вступления из события.';const details=[vars.detailsBefore?.trim(), 'Данные этапа и участия будут подставлены автоматически.', vars.detailsAfter?.trim()].filter(Boolean).join('\n');return selected.body.replace(/\{\{heading\}\}/g,heading).replace(/\{\{intro\}\}/g,intro).replace(/\{\{stageName\}\}/g,'USD Winter Cup Краснодар').replace(/\{\{details\}\}/g,details)},[selected]);
 const availableVariables=selected?.trigger.startsWith('AUTH_')?[
  {token:'{{heading}}',label:'Заголовок',description:'Заголовок системного письма.'},
  {token:'{{intro}}',label:'Вступление',description:'Основной текст события.'},
  {token:'{{details}}',label:'Дополнительный текст',description:'Пояснение или безопасные детали письма.'},
 ]:[
  {token:'{{heading}}',label:'Заголовок',description:'Заголовок уведомления.'},
  {token:'{{intro}}',label:'Вступление',description:'Текст перед подробностями.'},
  {token:'{{stageName}}',label:'Название этапа',description:'Название этапа без номера.'},
  {token:'{{details}}',label:'Подробности',description:'Данные события: этап, автомобиль, номер участника и классы.'},
 ];
 const updateVariableText=(key:keyof EmailVariableTexts,value:string)=>updateSelected({variableTexts:{heading:'',intro:'',detailsBefore:'',detailsAfter:'',...(selected?.variableTexts??{}),[key]:value}});\n const insertVariable=(token:string)=>{const field=bodyRef.current;if(!field||!selected)return;const start=field.selectionStart??selected.body.length;const end=field.selectionEnd??start;const next=selected.body.slice(0,start)+token+selected.body.slice(end);updateSelected({body:next});requestAnimationFrame(()=>{field.focus();const pos=start+token.length;field.setSelectionRange(pos,pos);});};
 if(loading)return <PageFrame title="Шаблоны писем" subtitle="Загрузка шаблонов…"><div className="settings-section">Загружаем настройки писем…</div></PageFrame>;
 return <PageFrame title="Шаблоны писем" subtitle="Полная редакция тем, основного тела и подвалов системных email-уведомлений ЮСД">
  <div className="settings-section">
   <PanelTitle title="Шаблоны и триггеры" icon={Mail}/>
   <p className="settings-help">Редактируйте тему, тело и подвал отдельно. Для каждого системного триггера используется один включённый шаблон. Сервисные письма участникам не зависят от согласия на рекламную рассылку; открытие регистрации адресатам отправляется только при действующем согласии на новости.</p>
   <div className="button-row"><button className="secondary-button" onClick={addTemplate}><CopyPlus size={15}/> Добавить шаблон</button><button className="primary-button" onClick={()=>void save()} disabled={saving||!selected}><Save size={15}/>{saving?'Сохраняем…':'Сохранить изменения'}</button></div>
   <div className="email-template-layout">
    <div className="email-template-list">{templates.map(t=><button type="button" key={t.id} className={'email-template-item '+(selected?.id===t.id?'active':'')} onClick={()=>setSelectedId(t.id)}><strong>{t.name||'Без названия'}</strong><span>{triggers.find(x=>x.value===t.trigger)?.label||t.trigger}</span><small>{t.enabled?'Включён':'Отключён'}</small></button>)}</div>
    {selected&&<div className="email-template-editor">
     <div className="settings-form-grid">
      <label><span className="field-label">Название шаблона</span><input value={selected.name} maxLength={120} onChange={e=>updateSelected({name:e.target.value})}/></label>
      <label><span className="field-label">Триггер</span><select value={selected.trigger} onChange={e=>updateSelected({trigger:e.target.value})}>{triggers.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
      <label className="email-template-enabled"><input type="checkbox" checked={selected.enabled} disabled={selected.trigger.startsWith('AUTH_')} onChange={e=>updateSelected({enabled:e.target.checked})}/><span><strong>{selected.trigger.startsWith('AUTH_')?'Обязательное системное письмо':'Шаблон включён'}</strong><small className="field-help">{selected.trigger.startsWith('AUTH_')?'Письма подтверждения и восстановления нельзя отключить, чтобы участники не потеряли доступ к аккаунту.':'Для триггера должен быть включён только один шаблон.'}</small></span></label>
      <label className="email-template-wide"><span className="field-label">Тема письма</span><input value={selected.subject} maxLength={240} onChange={e=>updateSelected({subject:e.target.value})}/></label>
      <div className="email-template-wide email-variable-text-editor">
       <span className="field-label">Тексты переменных</span>
       <p className="field-help">Эти поля меняют текст, который подставляется в письмо. Оставьте поле пустым, чтобы использовать автоматически сформированный текст события. Данные этапа, классы и регистрация сохраняются автоматически.</p>
       <label><span className="field-label">Заголовок {{heading}}</span><input value={selected.variableTexts?.heading??''} maxLength={240} placeholder="Автоматический заголовок события" onChange={e=>updateVariableText('heading',e.target.value)}/></label>
       <label><span className="field-label">Вступление {{intro}}</span><textarea rows={3} maxLength={1500} value={selected.variableTexts?.intro??''} placeholder="Автоматическое вступление события" onChange={e=>updateVariableText('intro',e.target.value)}/></label>
       <label><span className="field-label">Текст перед подробностями {{details}}</span><textarea rows={2} maxLength={1000} value={selected.variableTexts?.detailsBefore??''} placeholder="Необязательно: например, «Детали вашей заявки:»" onChange={e=>updateVariableText('detailsBefore',e.target.value)}/></label>
       <label><span className="field-label">Текст после подробностей {{details}}</span><textarea rows={2} maxLength={1000} value={selected.variableTexts?.detailsAfter??''} placeholder="Необязательно: дополнительное пояснение" onChange={e=>updateVariableText('detailsAfter',e.target.value)}/></label>
      </div>
      <div className="email-template-wide">
       <label><span className="field-label">Основное тело письма</span><textarea ref={bodyRef} rows={8} value={selected.body} onChange={e=>updateSelected({body:e.target.value})}/></label>
       <div className="email-variable-tools">
        <span className="field-label">Вставить переменную в место курсора</span>
        <div className="email-variable-chips">{availableVariables.map(v=><button key={v.token} type="button" className="secondary-button email-variable-chip" title={v.description} onClick={()=>insertVariable(v.token)}><span>{v.label}</span><code>{v.token}</code></button>)}</div>
        <small className="field-help">Нажмите на переменную — она вставится в место курсора. Можно переставлять переменные и обычный текст как угодно. Используйте только кнопки из этого списка: неизвестные имена система не подставит. HTML и скрипты не исполняются.</small>
       </div>
      </div>
      <label><span className="field-label">Текст кнопки</span><input value={selected.buttonLabel} maxLength={80} onChange={e=>updateSelected({buttonLabel:e.target.value})}/></label>
      <label className="email-template-wide"><span className="field-label">Подвал письма</span><textarea rows={4} value={selected.footer} onChange={e=>updateSelected({footer:e.target.value})}/><small className="field-help">Системная ссылка управления рассылкой остаётся отдельной в нижней полосе письма.</small></label>
     </div>
     <div className="email-template-preview"><h3>Предпросмотр тела</h3><div className="email-preview-subject"><strong>Тема:</strong> {selected.subject.replace(/\{\{heading\}\}/g,'Пример уведомления ЮСД').replace(/\{\{intro\}\}/g,'Текст вступления').replace(/\{\{stageName\}\}/g,'USD Winter Cup Краснодар')}</div><div className="email-preview-body">{preview}</div><button type="button" className="primary-button email-preview-cta">{selected.buttonLabel||'Открыть ЮСД'}</button><div className="email-preview-footer">{selected.footer}</div></div>
     <div className="email-template-actions"><label><span className="field-label">Email для тестового письма</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><div className="button-row"><button className="secondary-button" onClick={()=>void test()} disabled={testing}><Send size={15}/>{testing?'Отправляем…':'Отправить тест этого триггера'}</button><button className="secondary-button" onClick={removeTemplate} disabled={starterTemplates.some(t=>t.id===selected.id)}><Trash2 size={15}/> Удалить добавленный шаблон</button></div></div>
    </div>}
   </div>
   {error&&<div className="notice" role="alert">{error}</div>}{message&&<div className="notice" role="status"><CheckCircle2 size={16}/><span>{message}</span></div>}
  </div>
  <div className="settings-section"><PanelTitle title="Как работают переменные" icon={Mail}/><p className="settings-help">Переменные — метки, которые система заменяет текстом и данными при отправке. В разделе «Тексты переменных» можно настроить заголовок и вступление, а также добавить пояснение до или после автоматических подробностей.</p><ul className="mail-test-steps"><li><strong>{'{{heading}}'}</strong> — заголовок текущего уведомления.</li><li><strong>{'{{intro}}'}</strong> — вступительный текст конкретного уведомления.</li><li><strong>{'{{stageName}}'}</strong> — название этапа без номера; доступно для писем о соревнованиях.</li><li><strong>{'{{details}}'}</strong> — подробности события. В подтверждении регистрации сюда попадают данные участия и классы, включая BassRace.</li></ul><p className="settings-help">Безопасность: текстовые значения экранируются, HTML и скрипты не исполняются. Системные ссылки и кнопка действия управляются отдельно и не теряются при редактировании тела письма.</p></div>
 </PageFrame>;
}
