import { useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Flag, Gauge, MapPin } from 'lucide-react';
import Stage from '../core/Stage';
import { assets, official, registrationUrl } from '../core/content';
import { ButtonLink, Events, Eyebrow, Footer, Header, Join, Live, News, Partners, Records, Results } from '../core/ui';
import { useReveal } from '../core/motion';
import './velocity.css';

export default function Velocity() {
  const root=useRef<HTMLDivElement>(null);
  const [drive,setDrive]=useState(false);
  useReveal(root);
  return <div className="concept-a experience" ref={root} id="top">
    <Header variant="velocity"/>
    <main id="main-content" tabIndex={-1}>
      <section className="velocity-hero">
        <div className="velocity-hero-lines" aria-hidden="true"/>
        <div className="shell velocity-hero-layout">
          <div className="velocity-copy" data-hero-copy>
            <Eyebrow>Соревнования USD по автозвуку</Eyebrow>
            <h1>РОЖДЁН<br/>ЗВУЧАТЬ<br/><em>ГРОМЧЕ.</em></h1>
            <p>Мощность, которую чувствуешь.<br/>Люди, которые не знают предела.</p>
            <div className="velocity-actions"><ButtonLink href={registrationUrl}>На старт</ButtonLink><a className="velocity-calendar" href="#events">Календарь этапов<ArrowUpRight size={17}/></a></div>
            <a className="velocity-scroll" href="#events"><span><ArrowDown size={16}/></span>ЛИСТАЙ. ПОЧУВСТВУЙ USD.</a>
          </div>
          <div className="velocity-exhibit">
            <div className="velocity-exhibit-top"><span>USD / DARK VELOCITY</span><span><i/>ВИЗУАЛЬНЫЙ РЕЖИМ</span></div>
            <Stage variant="velocity" intensity={drive?.88:.36} className="velocity-stage"/>
            <div className="velocity-exhibit-bottom"><span>СИЛА В КАЖДОЙ ДЕТАЛИ</span><button type="button" aria-pressed={drive} onClick={()=>setDrive(value=>!value)}><Gauge size={15}/>{drive?'СБРОСИТЬ ИМПУЛЬС':'ДОБАВИТЬ ИМПУЛЬС'}<span>{drive?'02':'01'}</span></button></div>
          </div>
        </div>
        <div className="shell velocity-hero-foot"><span>ULTIMATE SOUND DESTRUCTION</span><span>АДРЕНАЛИН В ЧИСТОМ ВИДЕ</span><span>EST. USD / RU</span></div>
      </section>
      <a className="velocity-next" href={registrationUrl} target="_blank" rel="noopener noreferrer"><div className="shell"><div className="velocity-next-label"><Flag size={17}/><span>СЛЕДУЮЩИЙ<br/>СТАРТ</span></div><strong>21.11<span>2026</span></strong><div className="velocity-next-place"><span>USD WINTER CUP</span><h2><MapPin size={17}/>Краснодар</h2></div><span className="velocity-next-state"><i/>Регистрация открыта</span><span className="velocity-next-arrow"><ArrowUpRight size={24}/></span></div></a>
      <Events variant="velocity"/>
      <section className="velocity-manifesto" data-reveal>
        <div className="velocity-manifesto-image"><img src={assets.car} alt="Тюнингованный автомобиль с открытой системой сабвуферов" width="1280" height="720" loading="lazy"/></div>
        <div className="shell velocity-manifesto-content"><Eyebrow>Мы не просто слушаем</Eyebrow><h2>МЫ ЧУВСТВУЕМ<br/><em>КАЖДЫЙ ГЕРЦ.</em></h2><p>От первой системы до нового рекорда.<br/>Здесь встречаются инженерия и характер.</p><ButtonLink href={official+'/participants'} quiet>Люди USD</ButtonLink></div>
        <span className="velocity-manifesto-credit">USD / SOUND CULTURE</span>
      </section>
      <Results variant="velocity"/>
      <Records variant="velocity"/>
      <Live variant="velocity"/>
      <News variant="velocity"/>
      <Partners variant="velocity"/>
      <Join variant="velocity"/>
    </main>
    <Footer/>
  </div>;
}
