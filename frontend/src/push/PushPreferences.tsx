import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPut } from "../api";
import { browserPushSupport, decodeVapidKey } from "./push-support";
import "./push-preferences.css";
type Preferences = {
  registrationOpen: boolean;
  reminders: boolean;
  announcements: boolean;
};
type Subscription = Preferences & {
  id: string;
  createdAt: string;
  consentAt: string;
};
type Settings = {
  enabled: boolean;
  publicKey: string | null;
  consentVersion: string;
  subscriptions: Subscription[];
};
const labels: Record<keyof Preferences, string> = {
  registrationOpen: "Открытие регистрации на этапы",
  reminders: "Напоминания за 3 дня и за день до моего этапа",
  announcements: "Новости и объявления USD",
};
const localId = () => {
  try {
    return localStorage.getItem("usd_push_subscription_id") ?? "";
  } catch {
    return "";
  }
};
export function PushPreferences() {
  const [settings, setSettings] = useState<Settings | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [consent, setConsent] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({
    registrationOpen: true,
    reminders: true,
    announcements: false,
  });
  const [currentId, setCurrentId] = useState(localId),
    [support] = useState(browserPushSupport);
  const load = async () => {
    const value = await apiGet<Settings>("/push/subscriptions");
    setSettings(value);
    return value;
  };
  useEffect(() => {
    let mounted = true;
    apiGet<Settings>("/push/subscriptions")
      .then((value) => {
        if (mounted) setSettings(value);
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const enable = async () => {
    if (busy || !consent || !settings?.publicKey || support !== "supported")
      return;
    setBusy(true);
    setError("");
    setNotice("");
    let newlyCreated: PushSubscription | null = null;
    try {
      // Keep the native permission request in this click handler before any await.
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Разрешение не получено. Измените разрешение уведомлений в настройках браузера, если хотите подключить их позже.",
        );
      const registration = await navigator.serviceWorker.register(
        "/usd-push-sw.js",
        { scope: "/" },
      );
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(settings.publicKey),
        }));
      if (!existing) newlyCreated = subscription;
      const saved = await apiPut<Subscription>("/push/subscriptions", {
        ...subscription.toJSON(),
        ...preferences,
        consent: true,
        consentVersion: settings.consentVersion,
      });
      try {
        localStorage.setItem("usd_push_subscription_id", saved.id);
      } catch {
        /* Browser storage can be disabled. */
      }
      setCurrentId(saved.id);
      setConsent(false);
      setNotice("Уведомления подключены для этого браузера.");
      await load();
    } catch (e) {
      if (newlyCreated) await newlyCreated.unsubscribe().catch(() => false);
      setError(
        e instanceof Error ? e.message : "Не удалось подключить уведомления",
      );
    } finally {
      setBusy(false);
    }
  };
  const update = async (
    item: Subscription,
    key: keyof Preferences,
    value: boolean,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiPatch("/push/subscriptions/" + encodeURIComponent(item.id), {
        registrationOpen: item.registrationOpen,
        reminders: item.reminders,
        announcements: item.announcements,
        [key]: value,
      });
      await load();
      setNotice("Предпочтения сохранены.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (item: Subscription) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiDelete("/push/subscriptions/" + encodeURIComponent(item.id));
      if (item.id === currentId) {
        const registration =
          await navigator.serviceWorker?.getRegistration("/");
        await (
          await registration?.pushManager.getSubscription()
        )?.unsubscribe();
        try {
          localStorage.removeItem("usd_push_subscription_id");
        } catch {}
        setCurrentId("");
      }
      await load();
      setNotice(
        "Согласие отозвано. Новые уведомления в этот браузер отправляться не будут.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отключить");
    } finally {
      setBusy(false);
    }
  };
  const current = settings?.subscriptions?.some(
    (item) => item.id === currentId,
  );
  const reason =
    support === "install"
      ? "На iPhone и iPad (iOS 16.4+) добавьте USD на экран «Домой» через меню «Поделиться», откройте установленное приложение и вернитесь сюда."
      : support === "insecure"
        ? "Для push-уведомлений нужно защищённое соединение HTTPS."
        : support === "unsupported"
          ? "Этот браузер не поддерживает Web Push. Попробуйте актуальный Chrome на Android или установленное приложение USD на iPhone."
          : "";
  return (
    <section className="push-preferences" aria-labelledby="push-settings-title">
      <div>
        <span className="eyebrow">СВЯЗЬ С USD</span>
        <h3 id="push-settings-title">Push-уведомления</h3>
        <p>
          Выберите уведомления для каждого браузера. Они могут быть видны на
          экране блокировки. В любое время можно изменить темы или отозвать
          согласие.
        </p>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!settings && !error && <p role="status">Загружаем настройки…</p>}
      {reason && <p className="push-help">{reason}</p>}
      {settings && !settings.enabled && (
        <p className="push-help">
          Push-уведомления пока не подключены организатором.
        </p>
      )}
      {settings?.subscriptions?.map((item, index) => (
        <div className="push-device" key={item.id}>
          <strong>
            {item.id === currentId
              ? "Этот браузер"
              : "Подключённый браузер " + (index + 1)}
          </strong>
          <small>
            Подключён {new Date(item.createdAt).toLocaleDateString("ru-RU")}
          </small>
          <div className="push-topics">
            {(Object.keys(labels) as Array<keyof Preferences>).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={item[key]}
                  disabled={busy}
                  onChange={(e) => void update(item, key, e.target.checked)}
                />
                <span>{labels[key]}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="secondary-button compact"
            disabled={busy}
            onClick={() => void remove(item)}
          >
            Отключить этот браузер
          </button>
        </div>
      ))}
      {settings?.enabled && !current && support === "supported" && (
        <div className="push-opt-in">
          <div className="push-topics">
            {(Object.keys(labels) as Array<keyof Preferences>).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={preferences[key]}
                  disabled={busy}
                  onChange={(e) =>
                    setPreferences((value) => ({
                      ...value,
                      [key]: e.target.checked,
                    }))
                  }
                />
                <span>{labels[key]}</span>
              </label>
            ))}
          </div>
          <label className="push-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Согласен получать выбранные push-уведомления USD в этом браузере.
              Адрес подписки и ключи доставки будут храниться до отключения
              подписки. Для доставки используются сервисы производителя
              браузера. <a href="/privacy">Политика конфиденциальности</a>.
            </span>
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={busy || !consent}
            onClick={() => void enable()}
          >
            {busy ? "Подключаем…" : "Подключить уведомления"}
          </button>
        </div>
      )}
      <small>
        Уведомления не заменяют обязательные письма о безопасности аккаунта и
        заявках. Доставку и отображение определяют браузер, сеть и настройки
        устройства.
      </small>
    </section>
  );
}
