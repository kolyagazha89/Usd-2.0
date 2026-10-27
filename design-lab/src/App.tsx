import { Component, Suspense, lazy, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { ArrowUpRight, Monitor, Smartphone, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { assets } from './core/content';
import './core/base.css';
import './lab.css';

const Velocity=lazy(()=>import('./concepts/Velocity'));
const Obsidian=lazy(()=>import('./concepts/Obsidian'));
const Sonic=lazy(()=>import('./concepts/Sonic'));
const concepts=[
  {id:'a',name:'DARK VELOCITY',short:'Velocity',word:'Скорость. Характер. Адреналин.',component:Velocity},
  {id:'b',name:'OBSIDIAN LUXURY',short:'Obsidian',word:'Тишина, которая звучит дорого.',component:Obsidian},
  {id:'c',name:'SONIC IMMERSION',short:'Sonic',word:'Звук как пространство.',component:Sonic},
];

class ErrorBoundary extends Component<{children:ReactNode},{error:boolean}> {
  state={error:false};
  static getDerivedStateFromError(){return {error:true};}
  componentDidCatch(error:Error,info:ErrorInfo){console.error('USD concept failed to load',error,info.componentStack);}
  render(){return this.state.error?<div className="lab-error"><img src={assets.logo} alt="USD"/><h1>Не удалось открыть концепцию.</h1><p>Обнови страницу, чтобы повторить загрузку.</p><button onClick={()=>location.reload()}><RotateCcw size={16}/>Обновить</button></div>:this.props.children;}
}

export default function App() {
  const params=new URLSearchParams(location.search);
  const selected=concepts.find(concept=>concept.id===params.get('concept'))??concepts[0];
  const phone=params.get('device')==='phone', embedded=params.get('embed')==='1';
  const [width,setWidth]=useState(390), [preview,setPreview]=useState<'current'|'source'>('current'), [frameKey,setFrameKey]=useState(0);
  const Experience=selected.component;
  useEffect(()=>{
    document.title=`USD — ${selected.id.toUpperCase()} / ${selected.name}`;
    document.documentElement.dataset.embedded=String(embedded);
    document.documentElement.dataset.concept=selected.id;
  },[selected.id,selected.name,embedded]);
  const link=(id:string,device=phone)=>`?concept=${id}${device?'&device=phone':''}`;
  return <ErrorBoundary>
    {!embedded&&<div className="lab-top"><a className="lab-brand" href={link('a',false)} aria-label="USD: три концепции"><span/>USD <small>DESIGN LAB</small></a><nav className="lab-concepts" aria-label="Выбор концепции">{concepts.map(concept=><a href={link(concept.id)} key={concept.id} aria-current={selected.id===concept.id?'page':undefined}><b>{concept.id.toUpperCase()}</b><span className="lab-full-name">{concept.name}</span><span className="lab-short-name">{concept.short}</span></a>)}</nav><div className="lab-devices" role="group" aria-label="Режим просмотра"><a href={link(selected.id,false)} aria-label="Полная ширина" aria-current={!phone?'page':undefined}><Monitor size={17}/></a><a href={link(selected.id,true)} aria-label="Мобильный экран" aria-current={phone?'page':undefined}><Smartphone size={17}/></a></div></div>}
    {phone&&!embedded?<div className="device-workspace"><div className="device-heading"><div><span>ПРОВЕРКА АДАПТИВНОСТИ</span><h1>{selected.name}</h1><p>{selected.word}</p></div><div className="device-controls"><label>Ширина<select value={width} onChange={event=>setWidth(Number(event.target.value))}><option value="360">360 px</option><option value="390">390 px</option><option value="430">430 px</option><option value="768">768 px</option></select></label><button type="button" onClick={()=>setFrameKey(value=>value+1)} aria-label="Перезапустить мобильный просмотр"><RotateCcw size={17}/></button></div></div><div className="device-layout"><aside className="device-notes"><span>{selected.id.toUpperCase()} / 03</span><h2>Проверь<br/>каждую деталь.</h2><p>Прокрути страницу внутри экрана. Открой меню, выбери направление, запусти демо измерения.</p><ul><li>Настоящая ширина окна {width} px</li><li>Работающая нижняя навигация</li><li>Адаптивная 3D-сцена</li></ul><div className="device-source-toggle" role="group" aria-label="Источник мобильной страницы"><button type="button" aria-pressed={preview==='current'} onClick={()=>setPreview('current')}>Концепция</button><button type="button" aria-pressed={preview==='source'} onClick={()=>setPreview('source')}>Текущий сайт</button></div><p className="device-disclaimer">Эмуляция размеров в Chromium. Настоящий Safari на iPhone проверяется отдельно.</p><div className="device-next"><a href={link(concepts[(concepts.indexOf(selected)+2)%3].id,true)} aria-label="Предыдущая концепция"><ChevronLeft size={18}/></a><span>ПЕРЕКЛЮЧИ КОНЦЕПЦИЮ</span><a href={link(concepts[(concepts.indexOf(selected)+1)%3].id,true)} aria-label="Следующая концепция"><ChevronRight size={18}/></a></div></aside><div className="device-frame" style={{width:width+16}}><div className="device-bezel"><span/>USD / MOBILE PREVIEW</div><iframe key={`${selected.id}-${width}-${preview}-${frameKey}`} src={preview==='source'?'https://app.usd-russia.ru/':`?concept=${selected.id}&embed=1`} title={`${preview==='source'?'Текущий USD':selected.name} — мобильная версия ${width}px`} style={{width,height:800}}/><div className="device-home-bar"><span/></div></div><aside className="device-side-label"><span>SCROLL TO EXPLORE</span><ArrowUpRight size={18}/></aside></div></div>:<Suspense fallback={<div className="concept-loading"><img src={assets.logo} alt="USD" width="529" height="474"/><span>ГОТОВИМ ПРОСТРАНСТВО ЗВУКА</span></div>}><Experience/></Suspense>}
  </ErrorBoundary>;
}
