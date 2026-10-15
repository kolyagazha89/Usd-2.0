import { useEffect, useState } from 'react';

const COOKIE_NOTICE_VERSION = '2026-10-v1';
const COOKIE_NOTICE_KEY = 'usd_cookie_notice_dismissed';

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(COOKIE_NOTICE_KEY) !== COOKIE_NOTICE_VERSION);
    } catch {
      // If storage is unavailable, still show the notice for this visit.
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(COOKIE_NOTICE_KEY, COOKIE_NOTICE_VERSION);
    } catch {
      // Dismiss for the current render even when storage is blocked.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside className="cookie-notice" role="dialog" aria-label="Уведомление об использовании cookie">
      <div className="cookie-notice__copy">
        <strong>Мы используем cookie</strong>
        <p>
          Технические cookie нужны для авторизации, защиты и корректной работы USD.
          Подробнее — в <a href="/privacy">политике конфиденциальности</a>.
        </p>
      </div>
      <button className="cookie-notice__button" type="button" onClick={dismiss}>
        Понятно
      </button>
      <style>{`
        .cookie-notice {
          position: fixed;
          z-index: 1000;
          left: max(20px, env(safe-area-inset-left));
          right: max(20px, env(safe-area-inset-right));
          bottom: max(20px, env(safe-area-inset-bottom));
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          max-width: 920px;
          margin: 0 auto;
          padding: 18px 20px;
          color: #f7f7f8;
          background: rgba(17, 18, 20, .97);
          border: 1px solid #393b40;
          border-radius: 16px;
          box-shadow: 0 18px 60px rgba(0, 0, 0, .28);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .cookie-notice__copy { min-width: 0; }
        .cookie-notice__copy strong { display: block; font-size: 14px; font-weight: 800; }
        .cookie-notice__copy p { margin: 5px 0 0; color: #c4c7cc; font-size: 12px; line-height: 1.55; }
        .cookie-notice__copy a { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
        .cookie-notice__button {
          flex: 0 0 auto;
          min-height: 42px;
          padding: 0 18px;
          border: 0;
          border-radius: 10px;
          background: #e21d2f;
          color: #fff;
          font: inherit;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }
        .cookie-notice__button:hover { background: #b91425; }
        .cookie-notice__button:focus-visible { outline: 3px solid rgba(226, 29, 47, .5); outline-offset: 3px; }
        @media (max-width: 560px) {
          .cookie-notice { left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); align-items: stretch; flex-direction: column; gap: 12px; padding: 16px; }
          .cookie-notice__button { width: 100%; }
        }
      `}</style>
    </aside>
  );
}
