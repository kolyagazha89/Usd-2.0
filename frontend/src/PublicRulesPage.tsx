import { useState } from 'react';
import { FileClock, Search } from 'lucide-react';

type Props = { settings: any; go: (path: string) => void };

export default function PublicRulesPage({ settings, go }: Props) {
  const [query, setQuery] = useState('');
  const source = String(settings?.registration?.rulesText || '').trim();
  const legal = settings?.legal || {};
  const links = ([
    ['rulesUrl', 'Полный регламент'],
    ['termsUrl', 'Условия участия'],
    ['privacyUrl', 'Политика конфиденциальности'],
    ['consentUrl', 'Согласие на обработку данных'],
  ] as [string, string][]).filter(([key]) => typeof legal[key] === 'string' && legal[key].trim());

  const isHeading = (line: string) =>
    /^(раздел|глава|приложение|часть)\s+[\wА-ЯЁа-яёIVX.-]+|^\d+(?:\.\d+)*[.)]?\s+|^[А-ЯЁ\s—–-]{9,}:?$/.test(line.trim());

  const sections: { id: string; title: string; body: string[] }[] = [];
  if (source) {
    const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let current: { id: string; title: string; body: string[] } | null = null;
    lines.forEach((line) => {
      if (isHeading(line) || !current) {
        current = {
          id: 'rules-section-' + (sections.length + 1),
          title: isHeading(line) ? line : 'Общие положения',
          body: [],
        };
        sections.push(current);
        if (!isHeading(line)) current.body.push(line);
      } else {
        current.body.push(line);
      }
    });
    if (!sections.length) sections.push({ id: 'rules-section-1', title: 'Общие положения', body: [source] });
  }

  const needle = query.trim().toLocaleLowerCase('ru');
  const filtered = sections.map((section) => ({
    ...section,
    body: section.body.filter((line) => !needle || (section.title + ' ' + line).toLocaleLowerCase('ru').includes(needle)),
  })).filter((section) =>
    !needle || section.title.toLocaleLowerCase('ru').includes(needle) || section.body.length > 0,
  );

  return (
    <div className="public-rules-page">
      <section className="public-rules-hero">
        <div className="public-rules-kicker"><span />ОФИЦИАЛЬНЫЕ ДОКУМЕНТЫ USD</div>
        <h2>Регламент <span>USD</span></h2>
        <p>Правила соревнований, требования к классам и документы для участников. Перед выступлением ознакомьтесь с действующей редакцией и условиями выбранного этапа.</p>
        <div className="public-rules-actions">
          <button onClick={() => go('/stages')}>Выбрать этап <span aria-hidden>↗</span></button>
          {legal.rulesUrl && <a href={legal.rulesUrl} target="_blank" rel="noreferrer">Открыть полный документ ↗</a>}
        </div>
      </section>

      {source ? (
        <section className="public-rules-layout">
          <aside className="public-rules-sidebar">
            <div className="public-rules-sidebar-label">В ЭТОМ РАЗДЕЛЕ</div>
            <label className="public-rules-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти пункт…" aria-label="Поиск по регламенту" />
            </label>
            <nav aria-label="Оглавление регламента">
              {filtered.map((section) => <a key={section.id} href={'#' + section.id}>{section.title}</a>)}
            </nav>
            <div className="public-rules-sidebar-note">Показан текст, опубликованный организаторами в настройках сайта.</div>
          </aside>
          <div className="public-rules-document">
            <div className="public-rules-document-top"><span>USD / REGULATIONS</span><span>{sections.length} {sections.length === 1 ? 'РАЗДЕЛ' : sections.length < 5 ? 'РАЗДЕЛА' : 'РАЗДЕЛОВ'}</span></div>
            {filtered.length ? filtered.map((section, index) => (
              <section className="public-rules-section" id={section.id} key={section.id}>
                <div className="public-rules-section-number">{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <h3>{section.title}</h3>
                  {section.body.map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
                </div>
              </section>
            )) : <div className="public-rules-empty">По этому запросу ничего не найдено.</div>}
            {links.length > 0 && <div className="public-rules-doc-links">{links.map(([key, label]) => <a key={key} href={legal[key]} target="_blank" rel="noreferrer">{label}<span aria-hidden>↗</span></a>)}</div>}
          </div>
        </section>
      ) : (
        <section className="public-rules-not-published">
          <div className="public-rules-not-published-icon"><FileClock size={24} /></div>
          <div>
            <div className="public-rules-sidebar-label">ДОКУМЕНТ ЕЩЁ НЕ ДОБАВЛЕН</div>
            <h3>Полный регламент пока не опубликован</h3>
            <p>Чтобы не вводить участников в заблуждение, мы не подменяем официальный документ кратким описанием. Когда организаторы опубликуют регламент, здесь появятся оглавление, разделы и поиск по пунктам.</p>
            {links.length > 0 && <div className="public-rules-doc-links">{links.map(([key, label]) => <a key={key} href={legal[key]} target="_blank" rel="noreferrer">{label}<span aria-hidden>↗</span></a>)}</div>}
          </div>
        </section>
      )}

      <section className="public-rules-registration-note">
        <div><strong>Планируете выступать?</strong><span>Посмотрите опубликованные этапы и условия регистрации.</span></div>
        <button onClick={() => go('/stages')}>Перейти к этапам <span aria-hidden>↗</span></button>
      </section>
    </div>
  );
}
