import { useState } from 'react';
import { apiPost } from '../api';

type PreviewRow = {
  line: number;
  classMark: number;
  place: number;
  value: number;
  number: number;
  printedName: string;
  participant: string | null;
  status: 'READY' | 'ALREADY_IMPORTED' | 'BLOCKED';
  issue: string | null;
};
type ImportPreview = {
  previewHash: string;
  rows: PreviewRow[];
  errors: string[];
  readyCount: number;
  alreadyCount: number;
  canCommit: boolean;
};

export default function BassRaceTextImport({ stageId, stageStatus, onImported }: {
  stageId: string;
  stageStatus: string;
  onImported: () => Promise<void> | void;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const allowed = stageStatus === 'COMPLETED';
  const inspect = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError(''); setNotice(''); setPreview(null);
    try {
      setPreview(await apiPost<ImportPreview>('/results/admin/bassrace/preview', { stageId, text }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось проверить протокол');
    } finally { setBusy(false); }
  };
  const commit = async () => {
    if (busy || !preview?.canCommit) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiPost<{ importedCount: number; unchangedCount: number }>(
        '/results/admin/bassrace/commit',
        { stageId, text, previewHash: preview.previewHash, confirmed: true },
      );
      setPreview(null);
      setNotice('Импортировано: ' + result.importedCount + '. Уже совпадали с протоколом: ' + result.unchangedCount + '.');
      await onImported();
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Импорт не выполнен, проверьте протокол заново');
    } finally { setBusy(false); }
  };

  return <details className="panel bassrace-text-import">
    <summary><strong>Импорт BassRace из текста программы замера</strong></summary>
    <p className="muted">После соревнования вставьте протокол целиком. USD сохранит <b>места из первой колонки</b> — значения дБ не определяют порядок финиша.</p>
    <p className="muted">Формат: «BassRace», «120.0 To 129.9», далее строки «1 129,90 055 Kostrykov Alexandr». Можно вставить сразу несколько классов.</p>
    {!allowed && <p role="status" className="judging-class-warning">Сначала переведите этап в статус «Завершён». До этого импорт недоступен.</p>}
    <label className="form-field">Протокол BassRace
      <textarea rows={12} value={text} maxLength={100000} disabled={busy || !allowed}
        placeholder={'BassRace\n120.0 To 129.9\n1 129,90 055 Kostrykov Alexandr\n2 129,65 024 Roman Vasiliy'}
        onChange={event => { setText(event.target.value); setPreview(null); setError(''); setNotice(''); }} />
    </label>
    <div className="toolbar">
      <button type="button" className="secondary-button" disabled={busy || !allowed || !text.trim()} onClick={() => void inspect()}>
        {busy ? 'Проверяем…' : 'Проверить текст'}
      </button>
    </div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {preview && <section aria-label="Предпросмотр BassRace">
      <p role="status">Строк: {preview.rows.length}. Новых: {preview.readyCount}. Уже совпадают: {preview.alreadyCount}. Ошибок: {preview.errors.length}.</p>
      {preview.errors.length > 0 && <div className="form-error" role="alert"><strong>Импорт заблокирован, пока ошибки не исправлены:</strong>
        <ul>{preview.errors.map((message, i) => <li key={i}>{message}</li>)}</ul></div>}
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Класс</th><th>Место</th><th>№</th><th>дБ</th><th>ФИО из программы</th><th>Профиль USD</th><th>Проверка</th></tr></thead>
          <tbody>{preview.rows.map((row, i) => <tr key={i}>
            <td>{row.classMark}</td><td>{row.place}</td><td>{String(row.number).padStart(3, '0')}</td>
            <td>{String(row.value).replace('.', ',')}</td><td>{row.printedName}</td>
            <td>{row.participant ?? 'Не найден'}</td>
            <td>{row.issue ?? (row.status === 'ALREADY_IMPORTED' ? 'Уже внесён' : 'Готов')}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="muted">Совпадение определяется по классу BassRace и его стартовому номеру, а не по транслитерации ФИО. Существующие отличающиеся результаты не перезаписываются.</p>
      <button type="button" className="primary-button" disabled={busy || !preview.canCommit || preview.readyCount === 0}
        onClick={() => void commit()}>{busy ? 'Сохраняем…' : 'Подтвердить и импортировать ' + preview.readyCount + ' результатов'}</button>
    </section>}
  </details>;
}
