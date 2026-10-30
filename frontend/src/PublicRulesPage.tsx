import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FileClock, Search } from 'lucide-react';
import { rulesListMarkers } from './rules-list-markers';

type InlineRun = { text: string; bold?: boolean; italic?: boolean; href?: string };
type Props = { settings: any; go: (path: string) => void; rulesText?: string };

function safeInlineHref(value: unknown): string {
  const candidate = String(value ?? '').trim();
  if (!candidate) return '';
  if (candidate.startsWith('#')) return candidate;
  try {
    const url = new URL(candidate, window.location.origin);
    if (url.protocol === 'mailto:' || url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch { /* Unsafe or malformed imported link. */ }
  return '';
}

function renderInline(runs: InlineRun[] | undefined, fallbackText: string, keyPrefix: string) {
  if (!Array.isArray(runs) || !runs.length) return fallbackText;
  return runs.map((run, index) => {
    let content: ReactNode = run.text;
    if (run.bold) content = <strong>{content}</strong>;
    if (run.italic) content = <em>{content}</em>;
    const href = safeInlineHref(run.href);
    if (href) content = <a href={href} key={keyPrefix + '-link-' + index} target={href.startsWith('mailto:') || href.startsWith('#') ? undefined : '_blank'} rel={href.startsWith('mailto:') || href.startsWith('#') ? undefined : 'noopener noreferrer'}>{content}</a>;
    return <span key={keyPrefix + '-' + index}>{content}</span>;
  });
}

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

function isStructuredHeading(block: any): boolean {
  if (block?.type === 'heading') return true;
  if (block?.type !== 'paragraph') return false;
  const text = String(block.text ?? '').trim();
  if (!text || text.length > 140) return false;
  return /^(?:раздел|глава|приложение|часть)\s+[\wА-ЯЁа-яёIVX.-]+/i.test(text)
    || /^\d+(?:\.\d+)*[.)]?\s+\S/.test(text)
    || /^[А-ЯЁ\s—–-]{9,}:?$/.test(text);
}

export default function PublicRulesPage({ settings, go, rulesText }: Props) {
  const [query, setQuery] = useState('');
  const published = settings?.registration?.rulesDocument?.published ?? null;
  const documentBlocks = Array.isArray(published?.blocks) ? published.blocks : [];
  const listMarkers = rulesListMarkers(documentBlocks);
  const source = String(documentBlocks.length ? documentBlocks.map((block: any) => block.text || (block.rows || []).flat().join(' ')).join('\n') : rulesText || settings?.registration?.rulesText || '').trim();
  const publishedUrl = safeDocumentUrl(published?.url);
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
  // Keep the whole section around a match: class limits must not disappear during search.
  type DocumentSection = {start:number;end:number;level:number;parent?:DocumentSection};
  const documentSections:DocumentSection[] = [], stack:DocumentSection[] = [];
  documentBlocks.forEach((block:any,index:number) => {
    if (!isStructuredHeading(block)) return;
    const level = block.type === 'heading' ? Math.max(1,Number(block.level)||2) : 2;
    while(stack.length && stack[stack.length-1].level >= level) stack.pop()!.end = index;
    const section:DocumentSection = {start:index,end:documentBlocks.length,level,parent:stack[stack.length-1]};
    documentSections.push(section);stack.push(section);
  });
  const selected = new Set<number>();
  if(needle) documentBlocks.forEach((block:any,index:number) => {
    if(!String(block.text ?? (block.rows ?? []).flat().join(' ')).toLocaleLowerCase('ru').includes(needle)) return;
    const section = documentSections.filter(section=>section.start<=index).at(-1);
    const start = section?.start ?? 0, end = section?.end ?? documentSections[0]?.start ?? documentBlocks.length;
    for(let i=start;i<end;i++) selected.add(i);
    for(let parent=section?.parent;parent;parent=parent.parent) selected.add(parent.start);
  });
  const visibleDocumentEntries = documentBlocks
    .map((block: any, index: number) => ({ block, index }))
    .filter(({ index }: { index: number }) => !needle || selected.has(index));
  const documentHeadings: { id: string; title: string; index: number }[] = visibleDocumentEntries
    .filter(({ block }: { block: any }) => isStructuredHeading(block))
    .map(({ block, index }: { block: any; index: number }) => ({
      id: 'rules-doc-heading-' + index, title: String(block.text ?? ''), index,
    }));
  const filtered = sections.filter(section => !needle ||
    [section.title, ...section.body].join(' ').toLocaleLowerCase('ru').includes(needle));
  const sectionCount = documentBlocks.length ? documentHeadings.length : filtered.length;
  const sectionWord = sectionCount % 10 === 1 && sectionCount % 100 !== 11 ? 'РАЗДЕЛ' :
    sectionCount % 10 >= 2 && sectionCount % 10 <= 4 && ![12,13,14].includes(sectionCount % 100) ? 'РАЗДЕЛА' : 'РАЗДЕЛОВ';

  return (
    <div className="public-rules-page">
      <section className="public-rules-hero">
        <div className="public-rules-kicker"><span />ОФИЦИАЛЬНЫЕ ДОКУМЕНТЫ USD</div>
        <h2>Регламент <span>USD</span></h2>
        <p>Единый регламент соревнований и требования к классам для всех этапов USD. Особенности конкретного соревнования указываются в описании этапа.</p>
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
            {needle && <button className="u-btn u-quiet" onClick={() => setQuery('')}>Сбросить поиск</button>}
            <nav aria-label="Оглавление регламента">
              {documentBlocks.length ? documentHeadings.map(heading => <a key={heading.id} href={'#' + heading.id}>{heading.title}</a>) : filtered.map(section => <a key={section.id} href={'#' + section.id}>{section.title}</a>)}
            </nav>
            <div className="public-rules-sidebar-note">Показан текст, опубликованный организаторами USD в настройках сайта.</div>
          </aside>
          <div className="public-rules-document">
            <div className="public-rules-document-top"><span>USD / REGULATIONS</span><span>{sectionCount} {sectionWord}</span></div>
            {documentBlocks.length ? (visibleDocumentEntries.length ? <div className="public-rules-rich-document">
              {visibleDocumentEntries.map(({ block, index }: { block: any; index: number }) => {
                if (isStructuredHeading(block)) {
                  const level = Math.min(4, Math.max(2, Number(block.level) || 2));
                  const headingId = 'rules-doc-heading-' + index; return level === 2 ? <h3 id={headingId} key={index}>{renderInline(block.runs, block.text, headingId)}</h3> : level === 3 ? <h4 id={headingId} key={index}>{renderInline(block.runs, block.text, headingId)}</h4> : <h5 id={headingId} key={index}>{renderInline(block.runs, block.text, headingId)}</h5>;
                }
                if (block.type === 'list-item') return <div className="public-rules-list-item" key={index} style={{paddingLeft: Math.min(8, Number(block.level) || 0) * 18 + 12}}><span>{listMarkers[index]}</span>{renderInline(block.runs, block.text, 'list-' + index)}</div>;
                if (block.type === 'table') return <div className="public-rules-table-wrap" key={index}><table><tbody>{(block.rows ?? []).map((cells: string[], rowIndex: number) => <tr key={rowIndex}>{cells.map((cell: string, cellIndex: number) => {
                  const runs = block.cellRuns?.[rowIndex]?.[cellIndex];
                  const value = renderInline(runs, cell, 'table-' + index + '-' + rowIndex + '-' + cellIndex);
                  return rowIndex === 0 ? <th key={cellIndex}>{value}</th> : <td key={cellIndex}>{value}</td>;
                })}</tr>)}</tbody></table></div>;
                return <p key={index}>{renderInline(block.runs, block.text, 'paragraph-' + index)}</p>;
              })}
              {publishedUrl && <p className="public-rules-original-doc"><a href={publishedUrl} target="_blank" rel="noopener noreferrer">Скачать оригинал регламента Word ↗</a><span>Редакция от {new Date(published.publishedAt || published.createdAt).toLocaleDateString('ru-RU')}</span></p>}
            </div> : <div className="public-rules-empty">По этому запросу ничего не найдено.</div>) : filtered.length ? filtered.map((section, index) => (
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
