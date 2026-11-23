import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,ArrowUpRight,Bot,CheckCircle2,Loader2,MessageCircle,RotateCcw,Send,ShieldCheck,UserRound} from 'lucide-react';
import {chatAssistant,getAssistantStages,getAssistantAiStatus,type AssistantAiStatus,type AssistantChatResponse,type AssistantChatMessage,type AssistantChatMode} from '../api';

type ChatEntry={role:'user'|'assistant';text:string;source?:AssistantChatResponse['source'];links?:AssistantChatResponse['links'];toolsUsed?:string[];mode?:AssistantChatMode};
type StageChoice={id:string;name:string;date:string;city?:string|null;status:string};

const greeting:ChatEntry={
 role:'assistant',
 text:'Я AI-консультант по соревнованиям USD. Спроси о правилах, классах, этапах, участниках, результатах, настройках сайта или работе судей. Для точных данных я обращаюсь к системе USD. На темы, не связанные с USD, не отвечаю.',
 source:'guide',
};
const designGreeting:ChatEntry={
 role:'assistant',
 text:'Обсудим изменение USD. Опиши идею — я разберу варианты, влияние на классы, регистрацию, инспекцию, результаты, офлайн-режим, риски и проверки. Не изменяю код, БД или настройки.',
 source:'guide',mode:'design',
};
const designSuggestions=[
 'Предлагаю разрешить смену класса решением судьи во время замера. Какие риски?',
 'Как улучшить офлайн-возврат результатов без потери истории?',
 'Хочу ускорить инспекцию на телефоне. Какие варианты реализации?',
 'Как изменить регистрацию на месте, не нарушая существующие номера?',
];
const suggestions=[
 'Что сейчас требует внимания?',
 'Проверь готовность этапа',
 'Проверь качество данных',
 'Разбери последний импорт',
 'Как судье изменить класс и добавить BassRace?',
 'Какие классы доступны на этапе?',
];

function AssistantPage({go,PageFrame}:{go:(path:string)=>void;PageFrame:React.ComponentType<any>;enumLabel:(value:any)=>string}){
 const [mode,setMode]=useState<AssistantChatMode>('ask');
 const [messages,setMessages]=useState<ChatEntry[]>([greeting]);
 const [input,setInput]=useState('');
 const [sending,setSending]=useState(false);
 const [error,setError]=useState('');
 const [stages,setStages]=useState<StageChoice[]>([]);
 const [stageId,setStageId]=useState('');
 const [aiStatus,setAiStatus]=useState<AssistantAiStatus|null>(null);
 const bottomRef=useRef<HTMLDivElement>(null);
 const textareaRef=useRef<HTMLTextAreaElement>(null);

 useEffect(()=>{
  let alive=true;
  void getAssistantStages().then(result=>{if(alive)setStages(result.items??[])}).catch(()=>{});
  void getAssistantAiStatus().then(result=>{if(alive)setAiStatus(result)}).catch(()=>{});
  return ()=>{alive=false};
 },[]);
 useEffect(()=>{bottomRef.current?.scrollIntoView({block:'end',behavior:'smooth'})},[messages,sending]);

 const send=async(quick?:string)=>{
  const text=(quick??input).trim();
  if(!text||sending)return;
  const history:AssistantChatMessage[]=messages
   .filter(item=>item!==greeting&&item!==designGreeting&&item.source!=='unavailable')
   .slice(-8)
   .map(item=>({role:item.role,content:item.text.slice(0,1200)}));
  setMessages(prev=>[...prev,{role:'user',text}]);
  setInput('');setSending(true);setError('');
  try{
   const answer=await chatAssistant(text,{history,stageId:stageId||undefined,mode});
   setMessages(prev=>[...prev,{role:'assistant',text:answer.reply,source:answer.source,links:answer.links,toolsUsed:Array.isArray((answer.data as any)?.toolsUsed)?(answer.data as any).toolsUsed:[],mode}]);
  }catch(e){
   const detail=e instanceof Error?e.message:'Неизвестная ошибка';
   setError('Запрос не выполнен: '+detail);
   setMessages(prev=>[...prev,{role:'assistant',text:'Не удалось связаться с API USD. Никаких изменений в системе не выполнено.',source:'unavailable'}]);
  }finally{setSending(false);textareaRef.current?.focus()}
 };
 const reset=()=>{if(sending)return;setMessages([mode==='design'?designGreeting:greeting]);setInput('');setError('');textareaRef.current?.focus()};
 const chooseMode=(next:AssistantChatMode)=>{
  if(sending||mode===next)return;
  setMode(next);setMessages([next==='design'?designGreeting:greeting]);setInput('');setError('');
 };
 const sourceName=(source:ChatEntry['source'])=>({
   database:'Проверено по базе USD',guide:'Инструкция',ai:'USD AI',unavailable:'Не удалось проверить',
 } as Record<string,string>)[source??'']??'';

 return <PageFrame title="Ассистент USD" subtitle="Вопросы по USD и обсуждение новых изменений — только чтение, без автоматического внесения правок.">
  <div className="assistant-workspace">
   <div className="assistant-workspace-toolbar">
    <div className="assistant-chat-mode-switch" role="group" aria-label="Режим ассистента">
     <button type="button" className={mode==='ask'?'primary-button compact':'secondary-button compact'}
      aria-pressed={mode==='ask'} onClick={()=>chooseMode('ask')} disabled={sending}>Вопросы по USD</button>
     <button type="button" className={mode==='design'?'primary-button compact':'secondary-button compact'}
      aria-pressed={mode==='design'} onClick={()=>chooseMode('design')} disabled={sending}>Обсудить изменение</button>
    </div>
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
     <div><strong>USD · Помощник администратора</strong><span>{aiStatus?(aiStatus.provider==='ollama'?(aiStatus.modelReady?'Локальная модель '+aiStatus.model+' готова':'Локальная модель '+aiStatus.model+' недоступна'):(aiStatus.aiConfigured?'Облачная модель '+aiStatus.model+' · ключ настроен':'OpenAI API · ключ не настроен')):'Отвечаю только по USD · проверяю факты через систему'}</span></div>
     <ShieldCheck className="assistant-trust-icon" size={21} aria-hidden="true"/>
    </div>
    <div className="assistant-messages" role="log" aria-live="polite" aria-relevant="additions text">
     {messages.map((entry,index)=><div key={index} className={'assistant-message '+entry.role}>
      <div className="message-avatar" aria-hidden="true">{entry.role==='assistant'?<Bot size={15}/>:<UserRound size={15}/>}</div>
      <div className="message-bubble">
       {entry.source&&<div className="assistant-source">{entry.source==='database'?<CheckCircle2 size={13}/>:<MessageCircle size={13}/>} {entry.source==='ai'&&entry.mode==='design'?'AI · анализ предложения':entry.source==='ai'&&entry.toolsUsed?.length?'AI · данные USD':sourceName(entry.source)}</div>}
       <div className="assistant-message-text">{entry.text}</div>
       {entry.links?.length?<div className="assistant-answer-links">
        {entry.links.filter(link=>/^\/admin\/[a-z0-9-/]+$/i.test(link.href)).map(link=><button type="button" key={link.href} className="assistant-answer-link" onClick={()=>go(link.href)}>{link.label}<ArrowUpRight size={13} aria-hidden="true"/></button>)}
       </div>:null}
      </div>
     </div>)}
     {sending&&<div className="assistant-message assistant"><div className="message-avatar"><Bot size={15}/></div><div className="message-bubble assistant-typing"><Loader2 size={15} className="spin"/>Проверяю запрос…</div></div>}
     <div ref={bottomRef}/>
    </div>
    <div className="assistant-chat-suggestions" aria-label={mode==='design'?'Идеи для обсуждения':'Быстрые проверки'}>
     {(mode==='design'?designSuggestions:suggestions).map(text=><button type="button" key={text} onClick={()=>void send(text)} disabled={sending}>{text}</button>)}
    </div>
    {error&&<div className="form-error assistant-request-error" role="alert"><AlertTriangle size={15}/>{error}</div>}
    <form className="assistant-composer" onSubmit={e=>{e.preventDefault();void send()}}>
     <label htmlFor="assistant-input" className="visually-hidden">Вопрос ассистенту USD</label>
     <textarea id="assistant-input" ref={textareaRef} value={input} onChange={e=>setInput(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}
      placeholder={mode==='design'?'Опиши идею или изменение USD, которое нужно обсудить…':'Спроси о данных, ошибках, этапах или порядке работы…'} rows={2} maxLength={12000} disabled={sending}/>
     <button className="primary-button" type="submit" disabled={!input.trim()||sending} aria-label="Отправить вопрос">
      {sending?<Loader2 size={18} className="spin"/>:<Send size={18}/>}<span>Отправить</span>
     </button>
    </form>
    <div className="assistant-chat-note"><ShieldCheck size={14} aria-hidden="true"/>{mode==='design'?'Это обсуждение и технический план, не выполненные изменения. Реализацию и проверку Ubuntu проводим отдельно.':'Я отвечаю только о USD. Для фактов использую систему и опубликованный регламент. Правки выполняются в профильных разделах с учётом прав доступа.'}</div>
   </section>
  </div>
 </PageFrame>
}

export default AssistantPage;
