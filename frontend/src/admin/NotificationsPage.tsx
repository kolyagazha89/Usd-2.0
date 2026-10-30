import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, listData, type User } from "../api";
import "./notifications.css";
type Message = {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  statuses: Array<{ status: string; count: number }>;
  _count: { deliveries: number };
};
type Summary = { enabled: boolean; subscribers: number; messages: Message[] };
const statusNames: Record<string, string> = {
  PENDING: "В очереди",
  SENDING: "Отправляется",
  RETRY: "Повтор позже",
  PROVIDER_ACCEPTED: "Принято сервисом браузера",
  SKIPPED: "Пропущено",
  EXPIRED: "Подписка истекла",
  FAILED: "Не отправлено",
};
export default function NotificationsPage({
  user,
  PageFrame,
}: {
  user: User;
  PageFrame: React.ComponentType<any>;
}) {
  const [summary, setSummary] = useState<Summary | null>(null),
    [stages, setStages] = useState<Array<{ id: string; name: string }>>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [path, setPath] = useState("/participant"),
    [stageId, setStageId] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const request = useRef({ signature: "", key: "" });
  const permissions = user.customRole?.permissions?.notifications ?? [];
  const canCreate =
    user.role === "ADMIN" ||
    permissions.includes("create") ||
    permissions.includes("*");
  const load = async () =>
    setSummary(await apiGet<Summary>("/push/admin/messages"));
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    void apiGet("/stages/public")
      .then((value) => setStages(listData(value)))
      .catch(() => {});
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !confirmed || !canCreate) return;
    setBusy(true);
    setError("");
    setNotice("");
    const payload = {
      title: title.trim(),
      body: body.trim(),
      path,
      stageId: stageId || undefined,
      confirmed: true,
    };
    const signature = JSON.stringify(payload);
    if (request.current.signature !== signature)
      request.current = { signature, key: crypto.randomUUID() };
    try {
      await apiPost("/push/admin/messages", {
        ...payload,
        requestKey: request.current.key,
      });
      setNotice(
        "Объявление поставлено в очередь. Согласие и выбранные темы проверяются перед отправкой.",
      );
      setConfirmed(false);
      request.current = { signature: "", key: "" };
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось поставить объявление в очередь",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageFrame
      title="Push-уведомления"
      subtitle="Объявления для подписчиков USD и состояние доставки"
    >
      <div className="notifications-page">
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notification-notice">
            {notice}
          </p>
        )}
        {!summary && !error && <p role="status">Загружаем сводку…</p>}
        {summary && (
          <div className="panel notification-overview">
            <strong>{summary.subscribers} подключённых браузеров</strong>
            <span>
              {summary.enabled
                ? "Отправка включена"
                : "Отправка не настроена организатором"}
            </span>
            <p>
              Подписки добровольные. Уведомления об открытии регистрации и
              напоминания за 3 дня и за день создаются автоматически. «Принято
              сервисом браузера» означает приём сообщения провайдером; показ на
              устройстве не гарантирован.
            </p>
            <button
              type="button"
              className="secondary-button compact"
              disabled={busy}
              onClick={() => void load().catch((e) => setError(e.message))}
            >
              Обновить сводку
            </button>
          </div>
        )}
        {canCreate && (
          <form
            className="panel notification-composer"
            onSubmit={(e) => void submit(e)}
          >
            <h2>Новое объявление</h2>
            <label>
              Получатели
              <select
                value={stageId}
                disabled={busy}
                onChange={(e) => {
                  setStageId(e.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">
                  Все подписчики темы «Новости и объявления»
                </option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    Участники этапа: {stage.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Заголовок
              <input
                required
                maxLength={80}
                value={title}
                disabled={busy}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
            <label>
              Текст
              <textarea
                required
                maxLength={240}
                rows={3}
                value={body}
                disabled={busy}
                onChange={(e) => {
                  setBody(e.target.value);
                  setConfirmed(false);
                }}
              />
              <small>
                {body.length}/240. Не указывайте личные данные: текст может быть
                виден на экране блокировки.
              </small>
            </label>
            <label>
              Ссылка в приложении
              <input
                required
                maxLength={300}
                placeholder="/stages/идентификатор"
                value={path}
                disabled={busy}
                onChange={(e) => {
                  setPath(e.target.value);
                  setConfirmed(false);
                }}
              />
              <small>
                Страница этапа (/stages/…), новостей (/news/…) или личного
                кабинета (/participant).
              </small>
            </label>
            <div className="notification-preview">
              <strong>{title || "Заголовок уведомления"}</strong>
              <p>{body || "Текст уведомления"}</p>
            </div>
            <label className="notification-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                Проверил текст и получателей. Подтверждаю отправку выбранным
                подписчикам.
              </span>
            </label>
            <button
              className="primary-button"
              disabled={
                busy ||
                !summary?.enabled ||
                !confirmed ||
                !title.trim() ||
                !body.trim()
              }
            >
              {busy ? "Добавляем в очередь…" : "Поставить в очередь"}
            </button>
          </form>
        )}
        <section className="panel notification-history">
          <h2>Последние объявления и автоматические уведомления</h2>
          {summary?.messages.length === 0 && <p>Уведомлений пока нет.</p>}
          {summary?.messages.map((message) => (
            <article key={message.id}>
              <strong>{message.title}</strong>
              <small>
                {new Date(message.createdAt).toLocaleString("ru-RU")} ·{" "}
                {message._count.deliveries} получателей
              </small>
              <p>{message.body}</p>
              <div className="notification-statuses">
                {message.statuses.map((item) => (
                  <span key={item.status}>
                    {statusNames[item.status] ?? item.status}: {item.count}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </PageFrame>
  );
}
