import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api';
import { AlertTriangle, Check, Download, RefreshCw } from 'lucide-react';

import {parseHistoricalBatch,type HistoricalBatch as Batch} from './global-historical-response';
const labels: Record<string, string> = { PENDING: 'В очереди', RUNNING: 'Импортируем', DONE: 'Готово', NO_RESULTS: 'Нет листа результатов', REVIEW: 'Нужна проверка', FAILED: 'Не завершён' };

export function GlobalHistoricalImportPanel({ onOpenJob }: { onOpenJob: (id: string) => void }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = parseHistoricalBatch(await apiGet<unknown>('/imports/historical/global/latest'));
        if (stopped) return;
        setBatch(next); setError('');
        if (next?.status === 'RUNNING') timer = setTimeout(() => void poll(), 2000);
      } catch (caught) { if (!stopped) { setError(caught instanceof Error ? caught.message : 'Не удалось получить состояние импорта'); timer = setTimeout(() => void poll(), 4000); } }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [batch?.id, batch?.status]);
  const start = async () => {
    if (busy || batch?.status === 'RUNNING') return;
    setBusy(true); setError('');
    try { const next=parseHistoricalBatch(await apiPost<unknown>('/imports/historical/global/start', {})); if(!next)throw new Error('Сервер не вернул задачу импорта. Повторите запуск.'); setBatch(next); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось запустить общий импорт'); }
    finally { setBusy(false); }
  };
  const download = async () => {
    if (!batch) return;
    try {
      const report = await apiGet('/imports/historical/global/' + batch.id + '/report');
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'usd-historical-import-report.json'; link.click(); URL.revokeObjectURL(url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось скачать отчёт'); }
  };
  const running = busy || batch?.status === 'RUNNING';
  const complete = batch?.status === 'COMPLETED';
  return <section className="panel global-history-panel" aria-label="Общий импорт всех исторических этапов">
    <div className="resource-editor-heading"><div><strong>Весь исторический архив — одной кнопкой</strong>
      <p>Общее сопоставление участников и машин по всем этапам из загруженного архива. Участие подтверждается результатами каждого этапа; конфигурации сохраняются по времени.</p>
    </div><button type="button" className="primary-button" disabled={running} onClick={() => void start()}><RefreshCw size={16} />{running ? 'Импорт выполняется…' : complete ? 'Проверить архив повторно' : batch ? 'Продолжить общий импорт' : 'Импортировать все этапы'}</button></div>
    <p>Аккаунты участников и тестовые профили защищены. Уже совпадающие результаты сохраняются. Спорные строки остаются в отчёте для проверки.</p>
    {error && <div className="form-error" role="alert"><AlertTriangle size={16} />{error}</div>}
    {batch && <>
      <div className="notice" role="status" aria-live="polite">{complete ? <Check size={18} /> : <RefreshCw size={18} />}<div>
        <strong>{complete ? 'Все исходные результаты обработаны' : running ? 'Импортируем архив. Страницу можно закрыть — задача сохранится.' : 'Проверенные данные сохранены. Остались строки для проверки.'}</strong>
        <p>Результатов в источнике: {batch.sourceResults}. Записано или уже совпало: <b>{batch.imported}</b>. Из них сохранено без замены: {batch.kept}. Требуют проверки: <b>{batch.needsReview}</b>.</p>
        <p>Этапов завершено: {batch.processedStages} из {batch.totalStages}. Архивных обозначений без подтверждённого ФИО: {batch.aliases}.</p>
        {batch.failedStages > 0 && <p>Не завершено этапов: {batch.failedStages}. После устранения причины нажмите «Продолжить общий импорт».</p>}
      </div></div>
      <progress max={Math.max(1, batch.sourceResults)} value={batch.imported} aria-label="Прогресс общего импорта" style={{ width: '100%', accentColor: '#b91c1c' }} />
      <div className="table-scroll"><table className="resource-table"><thead><tr><th>Этап</th><th>Состояние</th><th>Результаты</th><th>Проверка</th></tr></thead><tbody>
        {batch.stages.map(stage => <tr key={stage.year + ':' + stage.number}><td>{stage.year} · {stage.name}</td><td>{labels[stage.status] ?? stage.status}{stage.error && <small className="form-error">{stage.error}</small>}</td><td>{stage.imported} / {stage.sourceRows}</td><td>{stage.jobId && (stage.review.length > 0 || stage.error) ? <button type="button" className="secondary-button compact" onClick={() => onOpenJob(stage.jobId!)}>Открыть строки</button> : '—'}</td></tr>)}
      </tbody></table></div>
      {batch.needsReview > 0 && <details><summary>Что требует проверки · {batch.needsReview}</summary><ul>{batch.stages.flatMap(stage => stage.review.map(row => <li key={stage.year + ':' + row.sheet + ':' + row.row}><b>{row.name}</b> · {row.sheet}, строка {row.row}: {row.reason}</li>))}</ul></details>}
      <button type="button" className="secondary-button compact" onClick={() => void download()}><Download size={15} />Скачать полный отчёт с исходными строками</button>
    </>}
  </section>;
}
