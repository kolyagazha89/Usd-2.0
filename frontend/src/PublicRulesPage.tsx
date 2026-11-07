import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FileClock, Search } from 'lucide-react';
import { rulesListMarkers } from './rules-list-markers';
import { rulesHeadingLevel, rulesOutline } from './rules-outline';
import './rules-reader.css';

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

function matchRanges(text:string,needle:string):[number,number][] {
  if(!needle)return [];
  const ranges:[number,number][]=[];const lower=text.toLocaleLowerCase('ru');let index=lower.indexOf(needle);
  while(index>=0){ranges.push([index,index+needle.length]);index=lower.indexOf(needle,index+needle.length)}
  return ranges;
}
function highlightRanges(text:string,ranges:[number,number][]):ReactNode {
  if(!ranges.length)return text;
  const result:ReactNode[]=[];let cursor=0;
  for(const [start,end] of ranges){result.push(text.slice(cursor,start),<mark key={start}>{text.slice(start,end)}</mark>);cursor=end}
  result.push(text.slice(cursor));return result;
}
const highlight=(text:string,needle:string)=>highlightRanges(text,matchRanges(text,needle));
function renderInline(runs: InlineRun[] | undefined, fallbackText: string, keyPrefix: string,needle='') {
  if (!Array.isArray(runs) || !runs.length) return highlight(fallbackText,needle);
  const ranges=matchRanges(runs.map(run=>run.text).join(''),needle);let offset=0;
  return runs.map((run, index) => {
    const start=offset;offset+=run.text.length;
    const local=ranges.filter(([a,b])=>a<offset&&b>start).map(([a,b])=>[Math.max(a,start)-start,Math.min(b,offset)-start] as [number,number]);
    let content: ReactNode = highlightRanges(run.text,local);
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

export default function PublicRulesPage({ settings, go, rulesText }: Props) {
  const [query, setQuery] = useState('');
  const [contentsOpen,setContentsOpen]=useState(false),[matchIndex,setMatchIndex]=useState(0);
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
  // A search never removes another clause, class limit or table from the regulation.
  const documentHeadings=rulesOutline(documentBlocks);
  const entries=documentBlocks.map((block:any,index:number)=>({block,index}));
  const matches:string[]=needle?(documentBlocks.length?entries.filter(({block}:{block:any})=>
    String(block.type==='table'?(block.rows??[]).flat().join(' '):block.text??'').toLocaleLowerCase('ru').includes(needle)
  ).map(({index}:{index:number})=>'rules-block-'+index):sections.filter(section=>[section.title,...section.body].join(' ').toLocaleLowerCase('ru').includes(needle)).map(section=>section.id)):[];
  const activeMatch=Math.min(matchIndex,Math.max(0,matches.length-1));
  const focusTarget=(id:string)=>{const el=document.getElementById(id);el?.scrollIntoView({block:'start',behavior:'instant'});el?.focus({preventScroll:true})};
  const moveMatch=(offset:number)=>{if(!matches.length)return;const next=(activeMatch+offset+matches.length)%matches.length;setMatchIndex(next);focusTarget(matches[next])};
  const sectionCount = documentBlocks.length ? documentHeadings.length : sections.length;
  const date=new Date(published?.publishedAt||published?.createdAt||'');
  const sectionWord = sectionCount % 10 === 1 && sectionCount % 100 !== 11 ? 'РАЗДЕЛ' :
    sectionCount % 10 >= 2 && sectionCount % 10 <= 4 && ![12,13,14].includes(sectionCount % 100) ? 'РАЗДЕЛА' : 'РАЗДЕЛОВ';

  return (
    <div className="public-rules-page">
      <section className="public-rules-hero">
        <div className="public-rules-kicker"><span />ОФИЦИАЛЬНЫЕ ДОКУМЕНТЫ USD</div>
        <h2>Регламент <span>USD</span></h2>
        <p>Единый регламент соревнований и требования к классам для всех этапов USD. Особенности конкретного соревнования указываются в описании этапа.</p>
        <div className="public-rules-actions">
          <a href="#rules-reader-start" onClick={()=>focusTarget('rules-reader-start')}>Читать регламент ↓</a>
          {links.some(([key]) => key === 'rulesUrl') && <a href={links.find(([key]) => key === 'rulesUrl')?.[2]} target="_blank" rel="noopener noreferrer">Открыть полный документ ↗</a>}
        </div>
      </section>
      {publishedUrl&&<div className="public-rules-original-doc"><a href={publishedUrl} target="_blank" rel="noopener noreferrer">Скачать оригинал регламента Word ↗</a>{!Number.isNaN(date.getTime())&&<span>Редакция от {date.toLocaleDateString('ru-RU')}</span>}</div>}
      {source ? (
        <section className="public-rules-layout" id="rules-reader-start" tabIndex={-1}>
          <aside className="public-rules-sidebar">
            <div className="public-rules-sidebar-label">В ЭТОМ РАЗДЕЛЕ</div>
            <label className="public-rules-search">
              <Search size={16} aria-hidden="true" />
              <input value={query} onChange={event => {setQuery(event.target.value);setMatchIndex(0)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();moveMatch(e.shiftKey?-1:1)}}} placeholder="Найти пункт или класс…" aria-label="Поиск по регламенту" />
            </label>
            {needle && <button className="u-btn u-quiet" onClick={() => setQuery('')}>Сбросить поиск</button>}
            {needle&&<div className="rules-search-result"><p role="status" aria-live="polite">{matches.length?`Пункт ${activeMatch+1} из ${matches.length}`:'Ничего не найдено. Попробуйте другое слово.'}</p><div><button type="button" disabled={!matches.length} onClick={()=>moveMatch(-1)} aria-label="Предыдущее совпадение">↑</button><button type="button" disabled={!matches.length} onClick={()=>moveMatch(1)} aria-label="Следующее совпадение">↓</button><button type="button" disabled={!matches.length} onClick={()=>focusTarget(matches[activeMatch])}>К пункту</button></div></div>}
            <button type="button" className="rules-contents-toggle" aria-expanded={contentsOpen} aria-controls="rules-contents" onClick={()=>setContentsOpen(!contentsOpen)}>Оглавление · {sectionCount} <span aria-hidden="true">{contentsOpen?'−':'+'}</span></button>
            <nav id="rules-contents" className={contentsOpen?'is-open':''} aria-label="Оглавление регламента">
              {documentBlocks.length ? documentHeadings.map(heading => <a data-level={heading.level} key={heading.id} href={'#' + heading.id} onClick={()=>{setContentsOpen(false);focusTarget(heading.id)}}>{heading.title}</a>) : sections.map(section => <a key={section.id} href={'#' + section.id} onClick={()=>{setContentsOpen(false);focusTarget(section.id)}}>{section.title}</a>)}
            </nav>
            <div className="public-rules-sidebar-note">Показан текст, опубликованный организаторами USD в настройках сайта.</div>
          </aside>
          <div className="public-rules-document">
            <div className="public-rules-document-top"><span>USD / REGULATIONS</span><span>{sectionCount} {sectionWord}</span></div>
            {documentBlocks.length ? <div className="public-rules-rich-document">
              {entries.map(({ block, index }: { block: any; index: number }) => {
                const id='rules-block-'+index,match=needle&&matches.includes(id);
                const props={id,tabIndex:-1,'data-rules-match':match?'true':undefined,'data-active-match':match&&matches[activeMatch]===id?'true':undefined};
                const level=rulesHeadingLevel(block);
                if (level!==null) {
                  const headingId = 'rules-doc-heading-' + index;
                  const content=<span {...props}>{renderInline(block.runs,block.text,headingId,needle)}</span>;
                  return level===2?<h3 id={headingId} tabIndex={-1} key={index}>{content}</h3>:level===3?<h4 id={headingId} tabIndex={-1} key={index}>{content}</h4>:<h5 id={headingId} tabIndex={-1} key={index}>{content}</h5>;
                }
                if (block.type === 'list-item') return <div {...props} className="public-rules-list-item" key={index} style={{paddingLeft: Math.min(8, Number(block.level) || 0) * 18 + 12}}><span>{listMarkers[index]}</span><div>{renderInline(block.runs, block.text, 'list-' + index,needle)}</div></div>;
                if (block.type === 'table') return <div {...props} tabIndex={0} role="region" aria-label="Таблица регламента, прокручивается по горизонтали" className="public-rules-table-wrap" key={index}><table><tbody>{(block.rows ?? []).map((cells: string[], rowIndex: number) => <tr key={rowIndex}>{cells.map((cell: string, cellIndex: number) => {
                  const runs = block.cellRuns?.[rowIndex]?.[cellIndex];
                  const value = renderInline(runs, cell, 'table-' + index + '-' + rowIndex + '-' + cellIndex,needle);
                  return rowIndex === 0 ? <th key={cellIndex}>{value}</th> : <td key={cellIndex}>{value}</td>;
                })}</tr>)}</tbody></table></div>;
                return <p {...props} key={index}>{renderInline(block.runs, block.text, 'paragraph-' + index,needle)}</p>;
              })}
            </div> : sections.length ? sections.map((section, index) => (
              <section className="public-rules-section" id={section.id} tabIndex={-1} data-rules-match={needle&&matches.includes(section.id)?'true':undefined} key={section.id}>
                <div className="public-rules-section-number">{String(index + 1).padStart(2, '0')}</div>
                <div><h3>{highlight(section.title,needle)}</h3>{section.body.map((line, lineIndex) => <p key={lineIndex}>{highlight(line,needle)}</p>)}</div>
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
