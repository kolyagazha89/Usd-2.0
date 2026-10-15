import type { ReactNode } from 'react';
import './PublicStageRulesSnapshot.css';

type InlineRun = { text: string; bold?: boolean; italic?: boolean; href?: string };
type RulesBlock =
  | { type: 'heading'; level?: number; text?: string; runs?: InlineRun[] }
  | { type: 'paragraph'; text?: string; runs?: InlineRun[] }
  | { type: 'list-item'; ordered?: boolean; level?: number; text?: string; runs?: InlineRun[] }
  | { type: 'table'; rows?: string[][]; cellRuns?: InlineRun[][][] };

type Snapshot = {
  revisionId?: string;
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

export default function PublicStageRulesSnapshot({ snapshot, stageName }: { snapshot?: Snapshot | null; stageName: string }) {
  const blocks = Array.isArray(snapshot?.blocks) ? snapshot.blocks : [];
  if (!snapshot || !blocks.length) {
    return (
      <aside className="public-stage-rules public-stage-rules-unavailable" aria-label="Общий регламент соревнований">
        <strong>Общий регламент соревнований</strong>
        <p>Для всех этапов действует единый регламент ЮСД. Отдельный регламент для этапа «{stageName}» не требуется. Особенности конкретного этапа указаны в его описании.</p>
        <p><a href="/rules">Открыть общий регламент ↗</a></p>
      </aside>
    );
  }
  const dateValue = snapshot.publishedAt || snapshot.capturedAt;
  const parsedDate = dateValue ? new Date(dateValue) : null;
  const dateLabel = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsedDate)
    : '';
  const sourceUrl = safeDocumentUrl(snapshot.url);
  const counters: number[] = [];

  return (
    <details className="public-stage-rules">
      <summary>
        <span>
          <strong>Общий регламент соревнований</strong>
          <small>{dateLabel ? 'Редакция общего регламента от ' + dateLabel : 'Редакция, сохранённая при публикации этапа'}</small>
        </span>
        <span className="public-stage-rules-toggle" aria-hidden="true">+</span>
      </summary>
      <div className="public-stage-rules-body">
        <p className="public-stage-rules-notice">Это редакция общего регламента, зафиксированная при публикации этапа «{stageName}». Последующие изменения общего регламента не меняют сохранённую историческую редакцию.</p>
        <div className="public-rules-rich-document">
          {blocks.map((block, index) => {
            const text = 'text' in block ? String(block.text ?? '') : '';
            if (block.type === 'heading') {
              counters.length = 0;
              const level = Math.min(4, Math.max(2, Number(block.level) || 2));
              const content = renderInline(block.runs, text, 'stage-rules-heading-' + index);
              if (level === 2) return <h3 key={index}>{content}</h3>;
              if (level === 3) return <h4 key={index}>{content}</h4>;
              return <h5 key={index}>{content}</h5>;
            }
            if (block.type === 'list-item') {
              const level = Math.min(8, Math.max(0, Number(block.level) || 0));
              counters.length = level + 1;
              const marker = block.ordered ? String((counters[level] = (counters[level] || 0) + 1) + '.') : '•';
              return <div className="public-rules-list-item" key={index} style={{ paddingLeft: level * 18 + 12 }}><span>{marker}</span>{renderInline(block.runs, text, 'stage-rules-list-' + index)}</div>;
            }
            counters.length = 0;
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
      </div>
    </details>
  );
}
