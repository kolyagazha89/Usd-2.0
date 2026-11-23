import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,ArrowUpRight,Bot,CheckCircle2,Loader2,MessageCircle,RotateCcw,Send,ShieldCheck,UserRound} from 'lucide-react';
import {chatAssistant,getAssistantStages,type AssistantChatResponse,type AssistantChatMessage} from '../api';

type ChatEntry={role:'user'|'assistant';text:string;source?:AssistantChatResponse['source'];links?:AssistantChatResponse['links']};
type StageChoice={id:string;name:string;date:string;city?:string|null;status:string};

const greeting:ChatEntry={
 role:'assistant',
 text:'Я помогу разобраться в работе USD. Могу проверить состояние этапа, качество данных и импорты по реальной базе, объяснить порядок регистрации, инспекции и судейства. Если AI-модель недоступна, скажу об этом прямо.',
 source:'guide',
};
const suggestions=[
 'Что сейчас требует внимания?',
 'Проверь готовность этапа',
 'Проверь качество данных',
 'Разбери последний импорт',
 'Как судье изменить класс и добавить BassRace?',
];

function AssistantPage({go,PageFrame}:{go:(path:string)=>void;PageFrame:React.ComponentType<any>;enumLabel:(value:any)=>string}){
 const [messages,setMessages]=useState<ChatEntry[]>([greeting]);
 const [input,setInput]=useState('');
 const [sending,setSending]=useState(false);
 const [error,setError]=useState('');
 const [stages,setStages]=useState<StageChoice[]>([]);
 const [stageId,setStageId]=useState('');
 const bottomRef=useRef<HTMLDivElement>(null);
 const textareaRef=useRef<HTMLTextAreaElement>(null);

 useEffect(()=>{
  let alive=true;
  void getAssistantStages().then(result=>{if(alive)setStages(result.items??[])}).catch(()=>{});
  return ()=>{alive=false};
 },[]);
 useEffect(()=>{bottomRef.current?.scrollIntoView({block:'end',behavior:'smooth'})},[messages,sending]);

 const send=async(quick?:string)=>{
  const text=(quick??input).trim();
  if(!text||sending)return;
  const history:AssistantChatMessage[]=messages
   .filter(item=>item!==greeting&&item.source!=='unavailable')
   .slice(-8)
   .map(item=>({role:item.role,content:item.text.slice(0,1200)}));
  setMessages(prev=>[...prev,{role:'user',text}]);
  setInput('');setSending(true);setError('');
  try{
   const answer=await chatAssistant(text,{history,stageId:stageId||undefined});
   setMessages(prev=>[...prev,{role:'assistant',text:answer.reply,source:answer.source,links:answer.links}]);
  }catch(e){
   const detail=e instanceof Error?e.message:'Неизвестная ошибка';
   setError('Запрос не выполнен: '+detail);
   setMessages(prev=>[...prev,{role:'assistant',text:'Не удалось связаться с API USD. Никаких изменений в системе не выполнено.',source:'unavailable'}]);
  }finally{setSending(false);textareaRef.current?.focus()}
 };
 const reset=()=>{if(sending)return;setMessages([greeting]);setInput('');setError('');textareaRef.current?.focus()};
 const sourceName=(source:ChatEntry['source'])=>({
   database:'Проверено по базе USD',guide:'Инструкция',ai:'Ответ AI',unavailable:'Не удалось проверить',
 } as Record<string,string>)[source??'']??'';

 return <PageFrame title="Ассистент USD" subtitle="Реальные проверки системы и помощь с рабочими сценариями. Без ложных обещаний о выполненных изменениях.">
  <div className="assistant-workspace">
   <div className="assistant-workspace-toolbar">
    <div className="assistant-workspace-context">
     <MessageCircle size={18} aria-hidden="true"/>
     <label htmlFor="assistant-stage-context">Контекст этапа</label>
     <select id="assistant-stage-context" value={stageId} onChange={e=>setStageId(e.target.value)} disabled={sending}>
      <option value="">Ближайший актуальный этап</option>
      {stages.map(stage=><option value={stage.id} key={stage.id}>{stage.name}{stage.city?' · '+stage.city:''}{stage.date?' · '+new Date(stage.date).toLocaleDateString('ru-RU'):''}</option>)}
     </select>
    </div>
    <button type="button" className="secondary-button compact" onClick={reset} disabled={sending}><RotateCcw size={15}/>Новый диалог</button>
   </div>
   <section className="assistant-chat panel" aria-label="Чат ассистента USD">
    <div className="assistant-chat-head">
     <div className="assistant-avatar"><Bot size={22} aria-hidden="true"/></div>
     <div><strong>USD · Помощник администратора</strong><span>Проверки выполняются только на чтение, данные не меняются</span></div>
     <ShieldCheck className="assistant-trust-icon" size={21} aria-hidden="true"/>
    </div>
    <div className="assistant-messages" role="log" aria-live="polite" aria-relevant="additions text">
     {messages.map((entry,index)=><div key={index} className={'assistant-message '+entry.role}>
      <div className="message-avatar" aria-hidden="true">{entry.role==='assistant'?<Bot size={15}/>:<UserRound size={15}/>}</div>
      <div className="message-bubble">
       {entry.source&&<div className="assistant-source">{entry.source==='database'?<CheckCircle2 size={13}/>:<MessageCircle size={13}/>} {sourceName(entry.source)}</div>}
       <div className="assistant-message-text">{entry.text}</div>
       {entry.links?.length?<div className="assistant-answer-links">
        {entry.links.filter(link=>/^\/admin\/[a-z0-9-/]+$/i.test(link.href)).map(link=><button type="button" key={link.href} className="assistant-answer-link" onClick={()=>go(link.href)}>{link.label}<ArrowUpRight size={13} aria-hidden="true"/></button>)}
       </div>:null}
      </div>
     </div>)}
     {sending&&<div className="assistant-message assistant"><div className="message-avatar"><Bot size={15}/></div><div className="message-bubble assistant-typing"><Loader2 size={15} className="spin"/>Проверяю запрос…</div></div>}
     <div ref={bottomRef}/>
    </div>
    <div className="assistant-chat-suggestions" aria-label="Быстрые проверки">
     {suggestions.map(text=><button type="button" key={text} onClick={()=>void send(text)} disabled={sending}>{text}</button>)}
    </div>
    {error&&<div className="form-error assistant-request-error" role="alert"><AlertTriangle size={15}/>{error}</div>}
    <form className="assistant-composer" onSubmit={e=>{e.preventDefault();void send()}}>
     <label htmlFor="assistant-input" className="visually-hidden">Вопрос ассистенту USD</label>
     <textarea id="assistant-input" ref={textareaRef} value={input} onChange={e=>setInput(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}
      placeholder="Спроси о данных, ошибках, этапах или порядке работы…" rows={2} maxLength={12000} disabled={sending}/>
     <button className="primary-button" type="submit" disabled={!input.trim()||sending} aria-label="Отправить вопрос">
      {sending?<Loader2 size={18} className="spin"/>:<Send size={18}/>}<span>Отправить</span>
     </button>
    </form>
    <div className="assistant-chat-note"><ShieldCheck size={14} aria-hidden="true"/>Ответы по базе помечены отдельно от ответов AI. Правки регистраций, инспекций и результатов выполняются в профильных разделах с проверкой прав.</div>
   </section>
  </div>
 </PageFrame>
}

export default AssistantPage;
