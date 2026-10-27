import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUpRight, MoveUpRight, Play } from 'lucide-react';
import {
  Header,
  Footer,
  ButtonLink,
  Events,
  Results,
  Records,
  News,
  Partners,
  Live,
  Join,
} from '../core/ui';
import { assets, registrationUrl } from '../core/content';
import Stage from '../core/Stage';
import { useReveal } from '../core/motion';
import './obsidian.css';

export default function Obsidian() {
  const root = useRef<HTMLDivElement>(null);
  const signTab = useRef<HTMLButtonElement>(null);
  const detailTab = useRef<HTMLButtonElement>(null);
  const [heroMode, setHeroMode] = useState<'sign' | 'detail'>('sign');
  useReveal(root);

  function handleExhibitKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'sign' : event.key === 'End' ? 'detail' : heroMode === 'sign' ? 'detail' : 'sign';
    setHeroMode(next);
    (next === 'sign' ? signTab : detailTab).current?.focus();
  }

  return (
    <div className="concept-b experience" id="top" ref={root}>
      <Header variant="obsidian" />

      <main id="main-content">
        <section className="b-hero shell" aria-labelledby="b-hero-title">
          <div className="b-hero__edition" data-hero-copy>
            <span><i /> Российское движение автозвука</span>
            <span className="b-hero__concept">OBSIDIAN LUXURY <b>— 02</b></span>
          </div>

          <div className="b-hero__grid">
            <div className="b-hero__copy" data-hero-copy>
              <p className="b-hero__overline">Для тех, кто слышит больше.</p>
              <h1 id="b-hero-title">Сила звука.<br /><span>Чистая форма.</span></h1>
              <p className="b-hero__description" aria-live="polite">
                {heroMode === 'sign'
                  ? 'Инженерия, характер и точность. Автозвуковой спорт, в котором результат говорит за себя.'
                  : 'За каждой цифрой — система, собранная до последней детали. За каждой системой — человек.'}
              </p>
              <div className="b-hero__actions">
                <ButtonLink href={registrationUrl} className="b-primary-link">Стать участником</ButtonLink>
                <a className="b-text-link" href="#events">Календарь сезона <ArrowDown size={15} /></a>
              </div>
            </div>

            <div className={`b-exhibit b-exhibit--${heroMode}`}>
              <div className="b-exhibit__tabs" role="tablist" aria-label="Посмотреть объект" onKeyDown={handleExhibitKey}>
                <button
                  type="button"
                  ref={signTab}
                  id="b-sign-tab"
                  role="tab"
                  tabIndex={heroMode === 'sign' ? 0 : -1}
                  aria-selected={heroMode === 'sign'}
                  aria-controls="b-sign-panel"
                  onClick={() => setHeroMode('sign')}
                >Знак <span>01</span></button>
                <button
                  type="button"
                  ref={detailTab}
                  id="b-detail-tab"
                  role="tab"
                  tabIndex={heroMode === 'detail' ? 0 : -1}
                  aria-selected={heroMode === 'detail'}
                  aria-controls="b-detail-panel"
                  onClick={() => setHeroMode('detail')}
                >Детали <span>02</span></button>
              </div>

              <div className="b-exhibit__canvas" id="b-sign-panel" role="tabpanel" aria-labelledby="b-sign-tab" hidden={heroMode !== 'sign'}>
                <Stage variant="obsidian" className="b-logo-stage" intensity={0.42} />
                <span className="b-exhibit__axis b-exhibit__axis--top" aria-hidden="true">+</span>
                <span className="b-exhibit__axis b-exhibit__axis--bottom" aria-hidden="true">+</span>
              </div>
              <div className="b-exhibit__detail" id="b-detail-panel" role="tabpanel" aria-labelledby="b-detail-tab" hidden={heroMode !== 'detail'}>
                <img src={assets.speaker} alt="Деталь автомобильной акустической системы" />
                <div className="b-exhibit__detail-note"><span>За пределами<br />обычного звучания.</span><MoveUpRight size={26} strokeWidth={1} /></div>
              </div>

              <div className="b-exhibit__caption" aria-live="polite">
                <span>{heroMode === 'sign' ? 'Знак USD / в трёх измерениях' : 'Система / внимание к деталям'}</span>
                <span>{heroMode === 'sign' ? 'Исследуйте движением курсора' : 'Точность начинается внутри'}</span>
              </div>
            </div>
          </div>

          <div className="b-hero__foot" data-hero-copy>
            <a href="#events" className="b-hero__scroll"><ArrowDown size={14} /> Дальше — громче</a>
            <p>Люди. Техника. Результат.</p>
            <span>USD / АВТОЗВУКОВОЙ СПОРТ</span>
          </div>
        </section>

        <div className="b-calendar">
          <Events variant="obsidian" />
        </div>

        <section className="b-editorial shell" aria-labelledby="b-editorial-title" data-reveal>
          <div className="b-editorial__intro">
            <p className="b-kicker"><span>Философия USD</span><span>Искусство точности</span></p>
            <h2 id="b-editorial-title">Не просто громче.<br /><span>На другом уровне.</span></h2>
            <div className="b-editorial__aside"><span className="b-editorial__asterisk" aria-hidden="true">*</span><p>Когда звук становится<br />личным высказыванием.</p></div>
          </div>
          <figure className="b-editorial__image">
            <img src={assets.car} alt="Спортивный автомобиль с автомобильной аудиосистемой" loading="lazy" />
            <figcaption><span>Культура автозвука</span><span>Создано, чтобы чувствовать.</span><ArrowUpRight size={20} strokeWidth={1.25} /></figcaption>
          </figure>
          <div className="b-editorial__bottom">
            <span className="b-editorial__index">USD / В ДВИЖЕНИИ</span>
            <p>Соревнования объединяют тех, кто превращает увлечение в мастерство. От первой настройки до собственного рекорда — у каждого свой путь к точному результату.</p>
            <a className="b-text-link" href="#results">Увидеть результат <ArrowUpRight size={17} /></a>
          </div>
        </section>

        <div className="b-results"><Results variant="obsidian" /></div>

        <div className="b-records"><Records variant="obsidian" /></div>

        <div className="b-live">
          <div className="b-live__intro shell" data-reveal>
            <span className="b-kicker">Энергия момента</span>
            <p><Play size={11} fill="currentColor" /> Ближе к происходящему</p>
          </div>
          <Live variant="obsidian" />
        </div>

        <div className="b-news"><News variant="obsidian" /></div>
        <div className="b-partners"><Partners variant="obsidian" /></div>

        <div className="b-join">
          <div className="b-join__line shell" aria-hidden="true" data-reveal><span>СЛЕДУЮЩАЯ ГЛАВА</span><span>НАЧИНАЕТСЯ С ВАС</span></div>
          <Join variant="obsidian" />
        </div>
      </main>

      <Footer />
    </div>
  );
}
