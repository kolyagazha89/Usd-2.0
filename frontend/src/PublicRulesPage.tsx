import { useMemo, useState } from 'react';
import { FileClock, Search } from 'lucide-react';

type Props = { settings: any; go: (path: string) => void; rulesText?: string };

function safeDocumentUrl(value: unknown): string {
  const candidate = String(value ?? '').trim();
  if (!candidate) return '';
  try {
    const url = new URL(candidate, window.location.origin);
    if (url.origin !== window.location.origin && !['https:', 'http:'].includes(url.protocol)) return '';
    if (url.origin === window.location.origin || ['https:', 'http:'].includes(url.protocol)) return url.href;
  } catch { /* invalid CMS URL */ }
  return '';
}

export default function PublicRulesPage({ settings, go, rulesText }: Props) {
  const [query, setQuery] = useState('');
  const source = String(rulesText || settings?.registration?.rulesText || '').trim();
  const legal = settings?.legal || {};
  const links = ([
    ['rulesUrl', 'Полный регламент'],
    ['termsUrl', 'Условия участия'],
    ['privacyUrl', 'Политика конфиденциальности'],
    ['consentUrl', 'Согласие на обработку данных'],
  ] as [string, string][])
    .map(([key, label]) => [key, label, safeDocumentUrl(legal[key])] as const)
    .filter(([, , url]) => Boolean(url));

  const isHeading = (line: string) =>
    /^(раздел|глава|приложение|часть)\s+[\wА-ЯЁа-яёIVX.-]+|^\d+(?:\.\d+)*[.)]?\s+|^[А-ЯЁ\s—–-]{9,}:?$/.test(line.trim());

  const sections = useMemo(() => {
    const result: { id: string; title: string; body: string[] }[] = [];
    if (!source) return result;
    const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    let current: { id: string; title: string; body: string[] } | null = null;
    for (const line of lines) {
      if (isHeading(line) || !current) {
        current = { id: 'rules-section-' + (result.length + 1), title: isHeading(line) ? line : 'Общие положения', body: [] };
        result.push(current);
        if (!isHeading(line)) current.body.push(line);
      } else current.body.push(line);
    }
    return result;
  }, [source]);

  const needle = query.trim().toLocaleLowerCase('ru');
  const filtered = sections.map(section => {
    const titleMatches = !needle || section.title.toLocaleLowerCase('ru').includes(needle);
    return { ...section, body: titleMatches ? section.body : section.body.filter(line => line.toLocaleLowerCase('ru').includes(needle)) };
  }).filter(section => !needle || section.title.toLocaleLowerCase('ru').includes(needle) || section.body.length > 0);

  return (
    <div className="public-rules-page">
      <section className="public-rules-hero">
        <div className="public-rules-kicker"><span />ОФИЦИАЛЬНЫЕ ДОКУМЕНТЫ USD</div>
        <h2>Регламент <span>USD</span></h2>
        <p>Правила соревнований, требования к классам и документы для участников. Перед выступлением ознакомьтесь с действующей редакцией и условиями выбранного этапа.</p>
        <div className="public-rules-actions">
          <button onClick={() => go('/stages')}>Выбрать этап <span aria-hidden="true">↗</span></button>
          {links.some(([key]) => key === 'rulesUrl') && <a href={links.find(([key]) => key === 'rulesUrl')?.[2]} target="_blank" rel="noopener noreferrer">Открыть полный документ ↗</a>}
        </div>
      </section>
      {source ? (
        <section className="public-rules-layout">
          <aside className="public-rules-sidebar">
            <div className="public-rules-sidebar-label">В ЭТОМ РАЗДЕЛЕ</div>
            <label className="public-rules-search">
              <Search size={16} aria-hidden="true" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти пункт…" aria-label="Поиск по регламенту" />
            </label>
            <nav aria-label="Оглавление регламента">
              {filtered.map(section => <a key={section.id} href={'#' + section.id}>{section.title}</a>)}
            </nav>
            <div className="public-rules-sidebar-note">Показан текст, опубликованный организаторами USD в настройках сайта.</div>
          </aside>
          <div className="public-rules-document">
            <div className="public-rules-document-top"><span>USD / REGULATIONS</span><span>{sections.length} {sections.length === 1 ? 'РАЗДЕЛ' : sections.length < 5 ? 'РАЗДЕЛА' : 'РАЗДЕЛОВ'}</span></div>
            {filtered.length ? filtered.map((section, index) => (
              <section className="public-rules-section" id={section.id} key={section.id}>
                <div className="public-rules-section-number">{String(index + 1).padStart(2, '0')}</div>
                <div><h3>{section.title}</h3>{section.body.map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}</div>
              </section>
            )) : <div className="public-rules-empty">По этому запросу ничего не найдено.</div>}
            {links.length > 0 && <div className="public-rules-doc-links">{links.map(([key, label, url]) => <a key={key} href={url} target="_blank" rel="noopener noreferrer">{label}<span aria-hidden="true">↗</span></a>)}</div>}
          </div>
        </section>
      ) : (
        <section className="public-rules-not-published">
          <div className="public-rules-not-published-icon"><FileClock size={24} /></div>
          <div>
            <div className="public-rules-sidebar-label">ДОКУМЕНТ ЕЩЁ НЕ ДОБАВЛЕН</div>
            <h3>Полный регламент пока не опубликован</h3>
            <p>Чтобы не вводить участников в заблуждение, мы не подменяем официальный документ кратким описанием. Когда организаторы опубликуют регламент, здесь появятся оглавление, разделы и поиск по пунктам.</p>
            {links.length > 0 && <div className="public-rules-doc-links">{links.map(([key, label, url]) => <a key={key} href={url} target="_blank" rel="noopener noreferrer">{label}<span aria-hidden="true">↗</span></a>)}</div>}
          </div>
        </section>
      )}
      <section className="public-rules-registration-note">
        <div><strong>Планируете выступать?</strong><span>Посмотрите опубликованные этапы и условия регистрации.</span></div>
        <button onClick={() => go('/stages')}>Перейти к этапам <span aria-hidden="true">↗</span></button>
      </section>
    </div>
  );
}
