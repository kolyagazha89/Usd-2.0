import {useEffect,useState} from 'react';
import {AlertTriangle,Bot,LockKeyhole,Loader2,Sparkles,UserRound} from 'lucide-react';
import {chatAssistant,approveAssistantRequest,rejectAssistantRequest,executeAssistantFunction} from '../../api';
import {PageFrame} from '../AdminUI';

export default function AssistantPage({go}:{go:(p:string)=>void}){
 const [messages,setMessages]=useState<any[]>([{role:'assistant',text:'Привет. Я USD Copilot. Просто разговаривай со мной как с живым помощником: опиши, что хочешь проверить, найти или изменить. Я сам разберусь с контекстом системы и отвечу по делу.'}]);
 const [input,setInput]=useState(''),[sending,setSending]=useState(false),[error,setError]=useState('');
 const [confirming,setConfirming]=useState<any|null>(null),[confirmation,setConfirmation]=useState('');
 const send=async(text?:string)=>{
  const value=(text??input).trim();if(!value||sending)return;
  setMessages(m=>[...m,{role:'user',text:value}]);setInput('');setSending(true);setError('');
  try{
   const r=await chatAssistant(value);
   setMessages(m=>[...m,{role:'assistant',text:r.reply,action:r.action,data:r.data}]);
   if(r.action?.type==='CHANGE_REQUEST') setConfirming(r.action);
  }catch(e){setError(e instanceof Error?e.message:'Ассистент временно недоступен');setMessages(m=>[...m,{role:'assistant',text:'Не смог обработать запрос. Проверь доступность сервера и попробуй ещё раз.'}]);}
  finally{setSending(false)}
 };
 const confirmChange=async()=>{
  if(!confirming?.id)return;
  if(confirmation.trim().toUpperCase()!=='ПОДТВЕРЖДАЮ'){setError('Введите «ПОДТВЕРЖДАЮ», чтобы подтвердить изменение');return}
  setSending(true);setError('');
  try{
   const r=await approveAssistantRequest(confirming.id,confirmation);
   setMessages(m=>[...m,{role:'assistant',text:'Подтверждение получено. Запрос принят в защищённый контур. Если для задачи требуется изменение кода, система не выполняет его напрямую — оно должно пройти через отдельный исполнитель изменений.' ,data:r.execution}]);
   setConfirming(null);setConfirmation('');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось подтвердить изменение')}
  finally{setSending(false)}
 };
 const rejectChange=async()=>{
  if(!confirming?.id)return;
  setSending(true);setError('');
  try{await rejectAssistantRequest(confirming.id);setMessages(m=>[...m,{role:'assistant',text:'Хорошо, изменение не выполняю.'}]);setConfirming(null);setConfirmation('')}
  catch(e){setError(e instanceof Error?e.message:'Не удалось отклонить изменение')}
  finally{setSending(false)}
 };
 const runFunction=async(code:string,title:string)=>{
  setSending(true);setError('');
  try{const r=await executeAssistantFunction(code,{});setMessages(m=>[...m,{role:'assistant',text:`Готово. ${title} выполнена.`,data:r.result}])}
  catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить проверку')}
  finally{setSending(false)}
 };
 return <PageFrame title="Ассистент USD" subtitle="Живой рабочий диалог с AI: спрашивайте, проверяйте и ставьте задачи обычным языком." action={<span className="badge good"><Sparkles size={12}/>USD COPILOT</span>}>
  <div className="assistant-chat-layout assistant-chat-layout-single">
   <section className="assistant-chat panel">
    <div className="assistant-chat-head">
     <div className="assistant-avatar"><Bot size={21}/></div>
     <div><strong>USD Copilot</strong><span>Говорите обычным языком — я вижу актуальное состояние USD</span></div>
     <button className="secondary-button compact" onClick={()=>setMessages([{role:'assistant',text:'Новый диалог начат. Что делаем?'}])}>Новый чат</button>
    </div>
    <div className="assistant-messages">
     {messages.map((m:any,i:number)=><div key={i} className={'assistant-message '+m.role}>
      <div className="message-avatar">{m.role==='assistant'?<Bot size={15}/>:<UserRound size={15}/>}</div>
      <div className="message-bubble">
       <div className="assistant-message-text">{m.text}</div>
       {m.data&&<details className="assistant-data"><summary>Показать данные проверки</summary><pre>{JSON.stringify(m.data,null,2)}</pre></details>}
      </div>
     </div>)}
     {sending&&<div className="assistant-message assistant"><div className="message-avatar"><Bot size={15}/></div><div className="message-bubble typing">анализирую<span>.</span><span>.</span><span>.</span></div></div>}
    </div>
    <div className="assistant-chat-suggestions">{['Что сейчас требует внимания?','Проверь качество данных','Проверь текущий этап','Разбери последний импорт','Покажи состояние системы'].map(x=><button key={x} onClick={()=>void send(x)} disabled={sending}>{x}</button>)}</div>
    {confirming&&<div className="assistant-inline-confirm">
      <div className="assistant-inline-confirm-head"><div className="assistant-avatar small"><LockKeyhole size={16}/></div><div><strong>Нужно подтверждение</strong><span>Я подготовил действие, но сам его не применю без вашего согласия.</span></div></div>
      <div className="assistant-inline-confirm-body"><b>{confirming.title||'Изменение'}</b><p>{confirming.prompt||'Запрос подготовлен по вашему сообщению.'}</p><small>Риск: {assistantRiskName(confirming.risk||'Средний')}</small></div>
      <div className="assistant-inline-confirm-actions"><input value={confirmation} onChange={e=>setConfirmation(e.target.value)} placeholder="Введите ПОДТВЕРЖДАЮ"/><button className="primary-button compact" onClick={()=>void confirmChange()} disabled={sending}>Подтвердить</button><button className="secondary-button compact" onClick={()=>void rejectChange()} disabled={sending}>Не выполнять</button></div>
    </div>}
    {error&&<div className="form-error"><AlertTriangle size={15}/>{error}</div>}
    <form className="assistant-composer" onSubmit={e=>{e.preventDefault();void send()}}>
     <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Например: «проверь текущий этап и скажи, что мешает его провести»" rows={3} disabled={sending}/>
     <button className="primary-button" disabled={!input.trim()||sending}>{sending?<Loader2 size={17} className="spin"/>:<Sparkles size={17}/>}Отправить</button>
    </form>
    <div className="assistant-chat-note"><LockKeyhole size={13}/><span>Обычный разговор не создаёт очередь. Если ты просишь что-то изменить, я сначала покажу действие и попрошу явное подтверждение.</span></div>
   </section>
  </div>
 </PageFrame>
}
function assistantStatusName(x:string){const m:Record<string,string>={DRAFT:'Черновик',PENDING:'Ожидает подтверждения',APPROVED:'Подтверждено',REJECTED:'Отклонено',APPLIED:'Применено',CANCELLED:'Отменено'};return m[x]??enumLabel(x)}
function assistantTypeName(x:string){return ({CODE_CHANGE:'Изменение кода',ASSISTANT_FUNCTION:'Функция ассистента',SYSTEM_ACTION:'Действие системы'} as Record<string,string>)[x]??enumLabel(x)}
function assistantRiskName(x:string){return ({Низкий:'Низкий',Средний:'Средний',Высокий:'Высокий',Критический:'Критический',low:'Низкий',medium:'Средний',high:'Высокий',critical:'Критический'} as Record<string,string>)[x]??enumLabel(x)}
function enumLabel(value:any){if(value===null||value===undefined||value==='')return '';if(typeof value!=='string')return String(value);const labels:Record<string,string>={ADMIN:'Администратор',JUDGE:'Судья',PARTICIPANT:'Участник',DRAFT:'Черновик',ACTIVE:'Активен',INACTIVE:'Неактивен',PUBLISHED:'Опубликован',COMPLETED:'Завершён',CANCELLED:'Отменён',ARCHIVED:'Архивный',PASSED:'Прошёл',FAILED:'Не прошёл',PENDING:'Ожидает проверки',VERIFIED:'Подтверждён',READY:'Готово',WARNING:'Предупреждение',RESOLVED:'Исправлено',COMMITTED:'Зафиксирован',APPROVED:'Подтверждено',REJECTED:'Отклонено',APPLIED:'Применено'};return labels[value]??value.replace(/([A-Z])/g,' $1').replace(/_/g,' ').toLowerCase()}
function assistantStatusName(x:string){const m:Record<string,string>={DRAFT:'Черновик',PENDING:'Ожидает подтверждения',APPROVED:'Подтверждено',REJECTED:'Отклонено',APPLIED:'Применено',CANCELLED:'Отменено'};return m[x]??enumLabel(x)}
function assistantTypeName(x:string){return ({CODE_CHANGE:'Изменение кода',ASSISTANT_FUNCTION:'Функция ассистента',SYSTEM_ACTION:'Действие системы'} as Record<string,string>)[x]??enumLabel(x)}
function assistantRiskName(x:string){return ({Низкий:'Низкий',Средний:'Средний',Высокий:'Высокий',Критический:'Критический',low:'Низкий',medium:'Средний',high:'Высокий',critical:'Критический'} as Record<string,string>)[x]??enumLabel(x)}
