import type { ReactNode } from 'react';
import './PublicStageRulesSnapshot.css';
import { rulesListMarkers } from './rules-list-markers';
import { selectPublicStageRules } from './stage-rules-model';

type InlineRun = { text: string; bold?: boolean; italic?: boolean; href?: string };
type RulesBlock =
  | { type: 'heading'; level?: number; text?: string; runs?: InlineRun[] }
  | { type: 'paragraph'; text?: string; runs?: InlineRun[] }
  | { type: 'list-item'; ordered?: boolean; level?: number; text?: string; runs?: InlineRun[] }
  | { type: 'table'; rows?: string[][]; cellRuns?: InlineRun[][][] };

type Snapshot = {
  id?: string;
  revisionId?: string;
  createdAt?: string;
  fileName?: string;
  url?: string;
  publishedAt?: string;
  capturedAt?: string;
  blocks?: RulesBlock[];
};

function safeHref(value: unknown): string {
  const candidate = String(value ?? '').trim();
  if (!candidate) return '';
  if (candidate.startsWith('#')) return candidate;
  try {
    const url = new URL(candidate, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function renderInline(runs: InlineRun[] | undefined, fallbackText: string, prefix: string) {
  if (!Array.isArray(runs) || !runs.length) return fallbackText;
  return runs.map((run, index) => {
    let content: ReactNode = run.text;
    if (run.bold) content = <strong>{content}</strong>;
    if (run.italic) content = <em>{content}</em>;
    const href = safeHref(run.href);
    if (href) content = <a key={prefix + '-link-' + index} href={href} target={href.startsWith('mailto:') || href.startsWith('#') ? undefined : '_blank'} rel={href.startsWith('mailto:') || href.startsWith('#') ? undefined : 'noopener noreferrer'}>{content}</a>;
    return <span key={prefix + '-' + index}>{content}</span>;
  });
}

function safeDocumentUrl(value: unknown): string {
  const candidate = String(value ?? '').trim();
  if (!candidate) return '';
  try {
    const url = new URL(candidate, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export default function PublicStageRulesSnapshot({ snapshot, currentPublished, preferHistorical = false, stageName }: { snapshot?: Snapshot | null; currentPublished?: Snapshot | null; preferHistorical?: boolean; stageName: string }) {
  const { document, source } = selectPublicStageRules(currentPublished, snapshot, preferHistorical);
  const blocks = Array.isArray(document?.blocks) ? document.blocks : [];
  if (!document || !blocks.length) {
    return (
      <aside className="public-stage-rules public-stage-rules-unavailable" aria-label="Общий регламент соревнований">
        <strong>Общий регламент соревнований</strong>
        <p>Для всех этапов действует единый регламент USD. Отдельный регламент для этапа «{stageName}» не требуется. Особенности конкретного этапа указаны в его описании.</p>
        <p><a href="/rules">Открыть общий регламент ↗</a></p>
      </aside>
    );
  }
  const dateValue = document.publishedAt || document.createdAt || document.capturedAt;
  const parsedDate = dateValue ? new Date(dateValue) : null;
  const dateLabel = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsedDate)
    : '';
  const sourceUrl = safeDocumentUrl(document.url);
  const listMarkers = rulesListMarkers(blocks);

  return (
    <details className="public-stage-rules">
      <summary>
        <span>
          <strong>Общий регламент соревнований</strong>
          <small>{source==='historical' ? (dateLabel ? 'Историческая редакция от ' + dateLabel : 'Историческая редакция этапа') : (dateLabel ? 'Действующая редакция от ' + dateLabel : 'Действующий общий регламент')}</small>
        </span>
        <span className="public-stage-rules-toggle" aria-hidden="true">+</span>
      </summary>
      <div className="public-stage-rules-body">
        <p className="public-stage-rules-notice">{source==='historical' ? (preferHistorical ? <>Это регламент, действовавший на завершённом этапе «{stageName}». Последующие изменения не переписывают его историю. <a href="/rules">Открыть действующий общий регламент ↗</a></> : <>Это сохранённая при публикации этапа «{stageName}» историческая редакция. Действующая редакция временно недоступна здесь. <a href="/rules">Открыть общий регламент ↗</a></>) : <>Это действующий общий регламент USD для этапа «{stageName}». При публикации новой редакции он обновляется здесь автоматически. Исторические редакции этапов сохраняются отдельно.</>}</p>
        <div className="public-rules-rich-document">
          {blocks.map((block, index) => {
            const text = 'text' in block ? String(block.text ?? '') : '';
            if (block.type === 'heading') {
              const level = Math.min(4, Math.max(2, Number(block.level) || 2));
              const content = renderInline(block.runs, text, 'stage-rules-heading-' + index);
              if (level === 2) return <h3 key={index}>{content}</h3>;
              if (level === 3) return <h4 key={index}>{content}</h4>;
              return <h5 key={index}>{content}</h5>;
            }
            if (block.type === 'list-item') {
              const level = Math.min(8, Math.max(0, Number(block.level) || 0));
              const marker = listMarkers[index];
              return <div className="public-rules-list-item" key={index} style={{ paddingLeft: level * 18 + 12 }}><span>{marker}</span>{renderInline(block.runs, text, 'stage-rules-list-' + index)}</div>;
            }
            if (block.type === 'table') {
              const rows = Array.isArray(block.rows) ? block.rows : [];
              return <div className="public-rules-table-wrap" key={index}><table><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => {
                const content = renderInline(block.cellRuns?.[rowIndex]?.[cellIndex], String(cell ?? ''), 'stage-rules-table-' + index + '-' + rowIndex + '-' + cellIndex);
                return rowIndex === 0 ? <th key={cellIndex}>{content}</th> : <td key={cellIndex}>{content}</td>;
              })}</tr>)}</tbody></table></div>;
            }
            return <p key={index}>{renderInline(block.runs, text, 'stage-rules-paragraph-' + index)}</p>;
          })}
        </div>
        {sourceUrl && <p className="public-stage-rules-download"><a href={sourceUrl} target="_blank" rel="noopener noreferrer">Скачать исходный регламент Word ↗</a></p>}
        <p className="public-stage-rules-download"><a href="/rules">Полный регламент на странице документов ↗</a></p>
      </div>
    </details>
  );
}
