import { useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUpRight, AudioLines, SlidersHorizontal, VolumeX } from 'lucide-react';
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
import './sonic.css';

const directions = [
  {
    name: 'SPL',
    number: '01',
    caption: 'Предельное давление',
    description: 'Всё ради одного момента. Звуковое давление, точная настройка и система, которая раскрывает свой предел на площадке USD.',
    measure: 'Пиковое давление',
    unit: 'дБ',
    signal: 'Звуковое давление',
  },
  {
    name: 'BFSPL',
    number: '02',
    caption: 'Характер системы',
    description: 'Мощность становится характером. Направление для тех, кто собирает собственный звук и хочет показать, на что способна его система.',
    measure: 'Давление системы',
    unit: 'дБ',
    signal: 'Музыкальный сигнал',
  },
  {
    name: 'BassRace',
    number: '03',
    caption: 'Точный контроль',
    description: 'Почувствовать диапазон. Управлять громкостью. Здесь важен контроль: сильная система раскрывается в умении держать выбранный уровень.',
    measure: 'Давление в диапазоне',
    unit: 'дБ',
    signal: 'Контроль уровня',
  },
  {
    name: 'Storm Wall',
    number: '04',
    caption: 'Масштаб звука',
    description: 'Звук приобретает масштаб. Большие системы, смелые решения и люди, которые превращают пространство вокруг в часть своего выступления.',
    measure: 'Скорость потока',
    unit: 'м/с',
    signal: 'Скорость воздушного потока',
  },
] as const;

export default function Sonic() {
  const root = useRef<HTMLDivElement>(null);
  const [directionIndex, setDirectionIndex] = useState(0);
  const [intensity, setIntensity] = useState(0.56);
  const direction = directions[directionIndex];
  const intensityPercent = Math.round(intensity * 100);
  useReveal(root);

  return (
    <div className="concept-c experience" id="top" ref={root}>
      <Header variant="sonic" />

      <main id="main-content">
        <section className="sonic-hero shell" aria-labelledby="sonic-hero-title">
          <div className="sonic-hero-meta" data-hero-copy>
            <span><i /> ULTIMATE SOUND DESTRUCTION</span>
            <span className="sonic-concept-name">SONIC IMMERSION / 03</span>
            <span className="sonic-visual-badge"><span /> Визуальный режим</span>
          </div>

          <div className="sonic-theatre">
            <div className="sonic-stage-space">
              <span className="sonic-field-axis sonic-field-axis--x" aria-hidden="true" />
              <span className="sonic-field-axis sonic-field-axis--y" aria-hidden="true" />
              <div className="sonic-field-caption"><span>АКУСТИЧЕСКОЕ ПРОСТРАНСТВО</span><b>USD / C</b></div>
              <Stage variant="sonic" intensity={intensity} className="sonic-three-stage" />
              <span className="sonic-field-coordinate sonic-field-coordinate--one" aria-hidden="true">X / 0</span>
              <span className="sonic-field-coordinate sonic-field-coordinate--two" aria-hidden="true">Y / 0</span>
              <div className="sonic-field-bottom"><VolumeX size={13} /><span>БЕЗ ЗВУКА</span><i /><span>ИНТЕРАКТИВНАЯ СИМУЛЯЦИЯ</span></div>
            </div>

            <div className="sonic-hero-heading" data-hero-copy>
              <p className="sonic-kicker">ЧЕМПИОНАТ USD ПО АВТОЗВУКУ</p>
              <h1 id="sonic-hero-title"><span>ЗВУК.</span><span>БЕЗ ГРАНИЦ<span className="sonic-red-period">.</span></span></h1>
            </div>

            <div className="sonic-hero-copy" data-hero-copy>
              <div className="sonic-selected-label"><span>{direction.number} / {direction.name}</span><AudioLines size={19} /></div>
              <p className="sonic-direction-description" aria-live="polite">{direction.description}</p>
              <div className="sonic-hero-actions">
                <ButtonLink href={registrationUrl} className="sonic-register">Стать участником</ButtonLink>
                <a className="sonic-calendar-link" href="#events">Календарь этапов <ArrowDown size={15} /></a>
              </div>
            </div>

            <div className="sonic-scene-aside" aria-hidden="true"><span>МАТЕРИЯ.</span><span>ДАВЛЕНИЕ.</span><span>ЭНЕРГИЯ.</span></div>
          </div>

          <div className="sonic-direction-selector" aria-label="Направление соревнований">
            {directions.map((item, index) => (
              <button
                key={item.name}
                type="button"
                className={`sonic-direction ${directionIndex === index ? 'is-active' : ''}`}
                aria-pressed={directionIndex === index}
                onClick={() => setDirectionIndex(index)}
              >
                <span className="sonic-direction-index">{item.number}</span>
                <span className="sonic-direction-name">{item.name}</span>
                <span className="sonic-direction-caption">{item.caption}</span>
                <ArrowUpRight className="sonic-direction-arrow" size={20} />
              </button>
            ))}
          </div>

          <div className="sonic-control-strip" style={{ '--sonic-level': `${intensityPercent}%` } as CSSProperties}>
            <div className="sonic-control-intro"><SlidersHorizontal size={19} /><div><strong>Настройте пространство</strong><span>Управление визуальным полем</span></div></div>
            <div className="sonic-intensity-control">
              <div className="sonic-control-label"><label htmlFor="sonic-bass-level">Интенсивность баса</label><output htmlFor="sonic-bass-level">{intensityPercent}<span>%</span></output></div>
              <input id="sonic-bass-level" type="range" min="0" max="100" step="1" value={intensityPercent} onChange={(event) => setIntensity(Number(event.target.value) / 100)} aria-valuetext={`${intensityPercent} процентов, интенсивность визуализации`} />
              <div className="sonic-range-scale"><span>ТИШЕ</span><span>МОЩНЕЕ</span></div>
            </div>
            <div className="sonic-measurement-info" aria-live="polite"><span>{direction.measure}</span><strong>{direction.unit}<small> / {direction.name}</small></strong><span>{direction.signal} · справка о формате</span></div>
          </div>
        </section>

        <div className="sonic-word-strip" aria-hidden="true"><span>ЭНЕРГИЯ ВНУТРИ</span><i /><span>USD</span><i /><span>ЭНЕРГИЯ ВНУТРИ</span><i /><span>USD</span></div>

        <div className="sonic-section-wrap sonic-events-wrap" data-reveal><Events variant="sonic" /></div>

        <div className="sonic-performance-zone">
          <div className="sonic-section-wrap sonic-results-wrap" data-reveal><Results variant="sonic" /></div>
          <div className="sonic-section-wrap sonic-records-wrap" data-reveal><Records variant="sonic" /></div>
        </div>

        <section className="sonic-engineering shell" aria-labelledby="sonic-engineering-title" data-reveal>
          <div className="sonic-engineering-image">
            <img src={assets.speaker} alt="Деталь акустической системы: динамик и его конструкция" loading="lazy" />
            <div className="sonic-image-grid" aria-hidden="true" />
            <span className="sonic-photo-index">USD / ТЕХНИКА</span>
            <span className="sonic-photo-note">ФОРМА СЛЕДУЕТ ЗА ЗВУКОМ</span>
            <div className="sonic-image-corner sonic-image-corner--tl" aria-hidden="true" /><div className="sonic-image-corner sonic-image-corner--br" aria-hidden="true" />
          </div>
          <div className="sonic-engineering-copy">
            <p className="sonic-kicker"><span className="sonic-red-tick" /> ВНУТРИ КУЛЬТУРЫ</p>
            <h2 id="sonic-engineering-title">БОЛЬШЕ,<br />ЧЕМ<br /><span>ДЕЦИБЕЛЫ.</span></h2>
            <p>За каждым результатом — человек. Часы в мастерской, поиск своей настройки и команда, которая слышит тебя с полуслова.</p>
            <p>USD объединяет тех, кто строит звук своими руками. Здесь встречаются инженерная мысль, азарт соревнований и уважение к чужой работе.</p>
            <a href="#news" className="sonic-editorial-link">Люди. Системы. Истории. <ArrowUpRight size={19} /></a>
            <div className="sonic-engineering-spec"><span>01 / КОНСТРУКЦИЯ</span><span>02 / НАСТРОЙКА</span><span>03 / ХАРАКТЕР</span></div>
          </div>
        </section>

        <div className="sonic-section-wrap sonic-news-wrap" data-reveal><News variant="sonic" /></div>
        <div className="sonic-section-wrap sonic-partners-wrap" data-reveal><Partners variant="sonic" /></div>
        <div className="sonic-section-wrap sonic-live-wrap" data-reveal><Live variant="sonic" /></div>
        <div className="sonic-section-wrap sonic-join-wrap" data-reveal><Join variant="sonic" /></div>
      </main>

      <Footer />
    </div>
  );
}
