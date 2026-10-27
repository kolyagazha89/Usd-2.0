import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, ArrowRight, ArrowDown, Menu, X, CalendarDays, Activity, Trophy, UserRound, MapPin, Play, Pause, Radio, Check, RotateCcw } from 'lucide-react';
import { assets, events, formatValue, official, records, registrationUrl, stories, winners, type Variant } from './content';

export function Eyebrow({ children, className = '' }: {children:ReactNode; className?:string}) {
  return <div className={`eyebrow ${className}`}><span aria-hidden="true" />{children}</div>;
}
export function ButtonLink({ href, children, quiet=false, className='' }: {href:string; children:ReactNode; quiet?:boolean; className?:string}) {
  const external = href.startsWith('https:');
  return <a className={`button ${quiet?'button--quiet':''} ${className}`} href={href} {...(external ? {target:'_blank',rel:'noopener noreferrer'} : {})}>{children}<ArrowUpRight size={18} aria-hidden="true" /></a>;
}
export function Header({ variant }: {variant:Variant}) {
  const [open, setOpen] = useState(false);
  const id = useId(), toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const escape = (event:KeyboardEvent) => { if(event.key==='Escape'){ setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('keydown',escape);
    return () => document.removeEventListener('keydown',escape);
  },[open]);
  return <>
    <a className="skip-link" href="#main-content">Перейти к содержимому</a>
    <header className={`main-header header-${variant}`}>
      <div className="shell header-inner">
        <a className="brand" href="#top" aria-label="USD — главная"><img src={assets.logo} alt="USD" width="529" height="474"/><span>ULTIMATE SOUND<br/>DESTRUCTION</span></a>
        <nav className={`main-nav ${open?'is-open':''}`} id={id} aria-label="Навигация по странице">
          {[['#events','Этапы'],['#results','Результаты'],['#records','Рекорды'],['#live','LIVE']].map(([href,label])=><a key={href} href={href} onClick={()=>setOpen(false)}>{label}{label==='LIVE'&&<i aria-hidden="true"/>}</a>)}
          <a className="nav-account" href={official+'/login'} target="_blank" rel="noopener noreferrer">Личный кабинет <ArrowUpRight size={16}/></a>
        </nav>
        <button className="menu-toggle" ref={toggle} onClick={()=>setOpen(!open)} aria-label={open?'Закрыть меню':'Открыть меню'} aria-expanded={open} aria-controls={id}>{open?<X/>:<Menu/>}</button>
      </div>
    </header>
    <nav className="mobile-dock" aria-label="Быстрые переходы">
      {[[CalendarDays,'#events','Этапы'],[Activity,'#results','Результаты'],[Trophy,'#records','Рекорды'],[UserRound,official+'/login','Кабинет']].map(([Icon,href,label]:any)=><a key={href} href={href} {...(href.startsWith('https:')?{target:'_blank',rel:'noopener noreferrer'}:{})}><Icon size={20} strokeWidth={1.6}/><span>{label}</span></a>)}
    </nav>
  </>;
}
export function SectionHeading({index,label,title,href,linkLabel='Смотреть всё'}:{index:string;label:string;title:string;href?:string;linkLabel?:string}) {
  return <div className="section-heading"><div><Eyebrow><span className="section-index">{index}</span>{label}</Eyebrow><h2>{title}</h2></div>{href&&<a className="text-link" href={href} target={href.startsWith('https:')?'_blank':undefined} rel={href.startsWith('https:')?'noopener noreferrer':undefined}>{linkLabel}<ArrowUpRight size={18}/></a>}</div>;
}

export function Events({variant}:{variant:Variant}) {
  const [filter,setFilter]=useState('all');
  const filtered=events.filter(event=>filter==='all'||event.state===filter);
  return <section className={`events-section section section-${variant}`} id="events" data-reveal>
    <div className="shell">
      <SectionHeading index="01" label="Календарь чемпионата" title="Города. Люди. Децибелы." href={official+'/stages'} linkLabel="Все этапы"/>
      <div className="event-filters filter-row" role="group" aria-label="Фильтр этапов">{[['all','Все этапы'],['upcoming','Предстоящие'],['archive','Архив']].map(([value,label])=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}<span className="filter-hint" aria-live="polite">{filtered.length} {filtered.length===1?'этап':'этапа'} · 2026</span></div>
      <div className="event-grid">
        {filtered.map(event=><article className={`event-card ${event.state==='upcoming'?'event-featured':''}`} key={event.id}>
          <a className="event-art" href={event.href} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true"><img src={event.image} alt="" loading="lazy" width="1280" height="720"/><span className="event-art-number">{event.number}</span><span className="event-state"><i/>{event.label}</span></a>
          <div className="event-content"><div className="event-meta"><span><MapPin size={13}/>{event.city}</span><span>Этап {event.number}</span></div><div className="event-title-row"><div><h3><a href={event.href} target="_blank" rel="noopener noreferrer">{event.name}</a></h3><span className="event-city">{event.city}</span></div><div className="event-date"><strong>{event.date}</strong><span>{event.month}<small>{event.year}</small></span></div></div><a className="event-link" href={event.state==='upcoming'?registrationUrl:event.href} target="_blank" rel="noopener noreferrer">{event.state==='upcoming'?'На старт':'Смотреть этап'}<ArrowUpRight size={20}/></a></div>
        </article>)}
      </div>
      <p className="fixture-note">Календарь для демонстрации дизайна · 27.10.2026. Актуальные сведения — на действующем сайте USD.</p>
    </div>
  </section>;
}

export function Results({variant}:{variant:Variant}) {
  const [direction,setDirection]=useState('Все');
  const rows=winners.filter(row=>direction==='Все'||row.direction===direction);
  return <section className={`results-section section section-${variant}`} id="results" data-reveal><div className="shell">
    <SectionHeading index="02" label="Последние результаты" title="Цифры говорят громче." href={official+'/results'} linkLabel="Все результаты"/>
    <div className="result-filters filter-row" role="group" aria-label="Направление результатов">{['Все','SPL','BFSPL','BDW SPL'].map(value=><button key={value} type="button" aria-pressed={value===direction} onClick={()=>setDirection(value)}>{value}</button>)}<span className="filter-hint">Финал · Волгоград / 12.09.26</span></div>
    <div className="result-grid" aria-live="polite">{rows.map((row,index)=><a className="result-card" key={row.id} href={row.profile?official+'/participants/'+row.profile:official+'/results'} target="_blank" rel="noopener noreferrer"><div className="result-top"><span>01 <small>МЕСТО</small></span><span>{row.direction} / {row.className}</span></div><div className="result-value"><strong>{formatValue(row.value)}</strong><span> {row.unit}</span></div><div className="result-person"><span className="result-avatar" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><div><h3>{row.name}</h3><p>{row.team}</p></div><ArrowUpRight size={18}/></div></a>)}</div>
    <p className="fixture-note">Дизайн-пример: 3 результата SPL, 2 BFSPL и 1 BDW SPL. Часть карточек содержит демонстрационные значения.</p>
  </div></section>;
}

export function Records({variant}:{variant:Variant}) {
  const [active,setActive]=useState(0); const record=records[active];
  return <section className={`records-section section section-${variant}`} id="records" data-reveal><div className="shell">
    <SectionHeading index="03" label="Рекорды USD" title="У предела есть имя." href={official+'/records'} linkLabel="Все рекорды"/>
    <div className="record-layout"><div className="record-tabs" role="group" aria-label="Направление рекорда">{records.map((row,index)=><button className="record-tab" key={row.direction} aria-pressed={index===active} type="button" onClick={()=>setActive(index)}><span className="record-tab-index">0{index+1}</span><div><strong>{row.direction}</strong><span>{row.className}</span></div><span className="record-tab-value">{formatValue(row.value)} <small>{row.unit}</small></span><ArrowUpRight size={18}/></button>)}</div><article className="record-feature" aria-live="polite"><div className="record-feature-top"><span>{record.label}</span><Trophy size={22} strokeWidth={1.2}/></div><div className="record-number"><strong>{formatValue(record.value)}</strong><span> {record.unit}</span></div><div className="record-feature-bottom"><div><h3>{record.name}</h3><p>{record.detail}</p></div><a className="circle-link" href={official+'/records'} target="_blank" rel="noopener noreferrer" aria-label="Смотреть рекорды USD"><ArrowUpRight size={22}/></a></div></article></div>
    <p className="fixture-note">Рекорды приведены для демонстрации дизайна. Официальные сведения — в разделе рекордов действующего сайта USD.</p>
  </div></section>;
}

export function News({variant}:{variant:Variant}) {
  return <section className={`news-section section section-${variant}`} id="news" data-reveal><div className="shell"><SectionHeading index="05" label="Журнал USD" title="Больше, чем громкость." href={official+'/news'} linkLabel="Весь журнал"/><div className="news-grid">{stories.map(story=><a className="news-card" key={story.number} href={official+'/news'} target="_blank" rel="noopener noreferrer"><div className="news-image"><img src={story.image} alt={story.alt} loading="lazy" width="1280" height="720"/><span>{story.number}</span><ArrowUpRight size={20}/></div><div className="news-copy"><span>{story.category} / Редакционный концепт</span><h3>{story.title}</h3><p>{story.description}</p></div></a>)}</div></div></section>;
}

export function Partners({variant}:{variant:Variant}) {
  return <section className={`partners-section section-${variant}`} id="partners" data-reveal><div className="shell partner-layout"><div><Eyebrow>Вместе делаем громче</Eyebrow><h2>Партнёры USD</h2></div><div className="partner-rail"><a href={official+'/partners'} target="_blank" rel="noopener noreferrer" className="partner-name">Deaf Bonce<ArrowUpRight size={18}/></a><a className="partner-invite" href={official+'/contacts'} target="_blank" rel="noopener noreferrer">Стать частью<br/>чемпионата <ArrowUpRight size={21}/></a></div></div></section>;
}

export function Live({variant}:{variant:Variant}) {
  const [playing,setPlaying]=useState(false),[elapsed,setElapsed]=useState(0);
  const [view,setView]=useState('measurements');
  useEffect(()=>{if(!playing)return;const timer=window.setInterval(()=>setElapsed(value=>(value+1)%61),1000);return()=>clearInterval(timer)},[playing]);
  const number=148.6+Math.min(elapsed,28)*.925;
  return <section className={`live-section section section-${variant}`} id="live" data-reveal><div className="shell"><SectionHeading index="04" label="USD LIVE" title="В центре громких событий."/>
    <div className="live-layout"><div className={`live-visual ${playing?'is-playing':''}`}><img src={assets.car} alt="Автомобиль на площадке автозвука" loading="lazy" width="1280" height="720"/><div className="live-visual-shade"/><div className="live-top"><span><Radio size={15}/>ДЕМО МЕДИАЦЕНТРА</span><span>ВИЗУАЛЬНЫЙ РЕЖИМ</span></div><div className="live-center"><button className="live-play" type="button" onClick={()=>setPlaying(!playing)} aria-label={playing?'Остановить демо измерения':'Запустить демо измерения'}>{playing?<Pause size={24}/>:<Play size={24}/>}</button><h3>{playing?'Почувствуй момент.':'Здесь рождаются рекорды.'}</h3><p>Интерактивная демонстрация. Прямой эфир не запущен.</p></div><div className="live-bottom"><span>{String(Math.floor(elapsed/60)).padStart(2,'0')}:{String(elapsed%60).padStart(2,'0')} / ДЕМО</span><div className="live-progress"><span style={{width:(elapsed/60*100)+'%'}}/></div><button type="button" onClick={()=>{setElapsed(0);setPlaying(false)}} aria-label="Начать демо заново"><RotateCcw size={15}/></button></div></div>
      <div className="live-scores"><div className="live-switch" role="group" aria-label="Раздел медиацентра"><button type="button" aria-pressed={view==='measurements'} onClick={()=>setView('measurements')}>Измерения</button><button type="button" aria-pressed={view==='schedule'} onClick={()=>setView('schedule')}>На площадке</button></div>{view==='measurements'?<><div className="live-reading"><span>Визуальная симуляция / SPL</span><strong>{formatValue(number)}<small> дБ</small></strong><p><i/>{playing?'Демонстрационное измерение':'Ожидание запуска демо'}</p></div><div className="live-ranking">{winners.slice(0,3).map((row,index)=><div key={row.id}><span>0{index+1}</span><div><strong>{row.name}</strong><small>{row.className}</small></div><b>{formatValue(row.value)}<small> дБ</small></b></div>)}</div></>:<div className="live-schedule"><span><Check size={17}/>Техосмотр автомобиля</span><span><CalendarDays size={17}/>Регистрация участников</span><span><Activity size={17}/>Измерения по направлениям</span><p>Точное расписание публикует организатор в карточке этапа.</p><a className="text-link" href={official+'/stages'} target="_blank" rel="noopener noreferrer">Открыть календарь<ArrowUpRight size={18}/></a></div>}</div>
    </div></div></section>;
}

export function Join({variant}:{variant:Variant}) {
  return <section className={`join-section section-${variant}`} id="join" data-reveal><div className="shell"><Eyebrow>Следующий рекорд может быть твоим</Eyebrow><div className="join-layout"><h2>Твой автомобиль.<br/>Твой звук. <em>Твой USD.</em></h2><div><p>Собери конфигурацию. Выбери свой класс.<br/>И дай системе сказать за тебя.</p><ButtonLink href={registrationUrl}>Стать участником</ButtonLink></div></div></div></section>;
}
export function Footer() {
  return <footer className="main-footer"><div className="shell"><div className="footer-top"><a className="footer-brand" href="#top" aria-label="USD — к началу страницы"><img src={assets.logo} alt="USD" width="529" height="474"/></a><p>Соревнования, которые<br/>чувствуешь всем телом.</p><div><a href={official+'/rules'} target="_blank" rel="noopener noreferrer">Регламент<ArrowUpRight size={14}/></a><a href={official+'/participants'} target="_blank" rel="noopener noreferrer">Сообщество<ArrowUpRight size={14}/></a></div><div><a href={official+'/privacy'} target="_blank" rel="noopener noreferrer">Конфиденциальность</a><a href={official+'/contacts'} target="_blank" rel="noopener noreferrer">Контакты<ArrowUpRight size={14}/></a></div><a className="back-top" href="#top" aria-label="Наверх"><ArrowDown size={23}/></a></div><div className="footer-bottom"><span>© 2026 USD · Ultimate Sound Destruction</span><span>Интерактивная концепция / 27.10.2026</span><a href={official} target="_blank" rel="noopener noreferrer">Действующий сайт <ArrowRight size={14}/></a></div></div></footer>;
}
