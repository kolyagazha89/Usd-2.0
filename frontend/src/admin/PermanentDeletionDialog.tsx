import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPost } from "../api";
import "./permanent-deletion.css";
export type DeletionKind = "participant" | "stage" | "user";
type Preview = {
  label: string;
  fingerprint: string;
  counts: Record<string, number>;
  linkedAccount: string | null;
};
const labels: Record<string, string> = {
  sessions: "Сессии входа",
  tokens: "Токены доступа",
  participants: "Участники",
  accounts: "Учётные записи",
  cars: "Автомобили",
  configurationVersions: "Версии конфигураций",
  registrations: "Регистрации",
  results: "Результаты",
  records: "Рекорды",
  inspections: "Инспекции",
  disqualifications: "Дисквалификации",
  importJobs: "Импорты этапа",
  importRows: "Строки импорта",
  media: "Фотографии и афиши",
};
export function PermanentDeletionDialog({
  kind,
  id,
  onClose,
  onDeleted,
}: {
  kind: DeletionKind;
  id: string;
  onClose: () => void;
  onDeleted: (result: { storageCleanupPending: boolean }) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null),
    [confirmation, setConfirmation] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null),
    dialogRef = useRef<HTMLElement>(null);
  const load = async () => {
    setLoading(true);
    setPreview(null);
    setConfirmation("");
    setError("");
    try {
      setPreview(
        await apiGet<Preview>(
          "/admin/permanent-deletion/" + kind + "/" + encodeURIComponent(id),
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось проверить связанные данные",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus();
  }, [kind, id]);
  const remove = async () => {
    if (!preview || confirmation.trim() !== preview.label || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiPost(
        "/admin/permanent-deletion/" + kind + "/" + encodeURIComponent(id),
        { confirmation, fingerprint: preview.fingerprint },
      );
      onDeleted(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить");
      setPreview(null);
      setConfirmation("");
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="permanent-delete-overlay">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="permanent-delete-title"
        aria-describedby="permanent-delete-description"
        className="panel permanent-delete-dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) {
            e.preventDefault();
            onClose();
          }
          if (e.key === "Tab") {
            const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled)",
            );
            if (!controls?.length) return;
            const first = controls[0],
              last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <h2 id="permanent-delete-title">Удалить навсегда</h2>
        <p id="permanent-delete-description">
          Это действие нельзя отменить.{" "}
          {kind === "stage"
            ? "Этап, его регистрации, результаты, инспекции и история импорта будут удалены. Участники и их учётные записи останутся."
            : kind === "user"
              ? "Учётная запись, сессии, привязанный участник, его автомобили и вся история выступлений будут удалены."
              : "Участник, его автомобили, конфигурации и вся история выступлений будут удалены."}{" "}
          Места и рекорды будут пересчитаны.
        </p>
        {loading && <p role="status">Проверяем связанные данные…</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <>
            <strong>{preview.label}</strong>
            {preview.linkedAccount && (
              <p>
                Учётная запись {preview.linkedAccount} останется без
                привязанного участника. Для удаления входа используйте раздел
                «Пользователи».
              </p>
            )}
            <dl className="permanent-delete-counts">
              {Object.entries(preview.counts)
                .filter(([, count]) => count > 0)
                .map(([key, count]) => (
                  <div key={key}>
                    <dt>{labels[key] ?? key}</dt>
                    <dd>{count}</dd>
                  </div>
                ))}
            </dl>
            <label className="permanent-delete-confirm">
              Введите точно: <strong>{preview.label}</strong>
              <input
                autoComplete="off"
                value={confirmation}
                disabled={busy}
                onChange={(e) => setConfirmation(e.target.value)}
                aria-label="Подтверждение полного удаления"
              />
            </label>
          </>
        )}
        <div className="detail-actions">
          <button
            ref={cancelRef}
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            Отмена
          </button>
          {!preview && !loading && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void load()}
            >
              Обновить подтверждение
            </button>
          )}
          <button
            type="button"
            className="danger-button"
            disabled={busy || !preview || confirmation.trim() !== preview.label}
            onClick={() => void remove()}
          >
            {busy ? "Удаляем…" : "Удалить навсегда"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
