import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const COOKIE_NOTICE_VERSION = '2026-11-analytics-v2';
const COOKIE_NOTICE_KEY = 'usd_cookie_notice_dismissed';
const TRAFFIC_CONSENT_KEY = 'usd_traffic_analytics_consent_v1';

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);
  const noticeRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!visible || !noticeRef.current) return;
    const notice = noticeRef.current;
    const measure = () => document.documentElement.style.setProperty('--usd-cookie-height', `${Math.ceil(notice.getBoundingClientRect().height)}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(notice);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      document.documentElement.style.removeProperty('--usd-cookie-height');
    };
  }, [visible]);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(COOKIE_NOTICE_KEY) !== COOKIE_NOTICE_VERSION);
    } catch {
      // If storage is unavailable, still show the notice for this visit.
      setVisible(true);
    }
  }, []);

  useEffect(() => {const open=()=>setVisible(true);window.addEventListener('usd:cookie-open',open);return()=>window.removeEventListener('usd:cookie-open',open)},[]);

  const dismiss = (allowAnalytics:boolean) => {
    try {
      window.localStorage.setItem(COOKIE_NOTICE_KEY, COOKIE_NOTICE_VERSION);
      window.localStorage.setItem(TRAFFIC_CONSENT_KEY,allowAnalytics?'yes':'no');
    } catch {
      // Dismiss for the current render even when storage is blocked.
    }
    setVisible(false);
    window.dispatchEvent(new window.Event('usd:analytics-consent-changed'));
  };

  if (!visible) return null;

  return (
    <aside ref={noticeRef} className="cookie-notice" role="dialog" aria-label="Уведомление об использовании cookie">
      <div className="cookie-notice__copy">
        <strong>Мы используем cookie</strong>
        <p>
          Технические cookie нужны для авторизации, защиты и корректной работы USD.
          Анонимную статистику разделов и типов устройств собираем только с вашего разрешения — без IP, ФИО и идентификаторов.
          Подробнее — в <a href="/privacy">политике конфиденциальности</a>.
        </p>
      </div>
      <div className="cookie-notice__actions">
        <button className="cookie-notice__button secondary" type="button" onClick={()=>dismiss(false)}>
          Только необходимые
        </button>
        <button className="cookie-notice__button" type="button" onClick={()=>dismiss(true)}>
          Разрешить аналитику
        </button>
      </div>
      <style>{`
        .cookie-notice {
          position: fixed;
          z-index: 1000;
          left: max(20px, env(safe-area-inset-left));
          right: max(20px, env(safe-area-inset-right));
          bottom: calc(var(--usd-dock-height, 0px) + max(12px, env(safe-area-inset-bottom)));
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
        body:has(.cookie-notice) .cookie-notice { bottom: calc(var(--usd-dock-height, 0px) + 12px) !important; }
        /* Both mobile docks are bottom-fixed, so the cookie panel uses the
           same viewport edge rather than a drifting 100dvh top offset. */
        @media (max-width: 760px) {
          body:has(> .u-mobile-dock) .cookie-notice,
          body:has(> .participant-dock-viewport) .cookie-notice {
            top: auto !important;
            bottom: calc(var(--usd-dock-height, 79px) + 12px) !important;
            max-height: calc(100dvh - var(--usd-dock-height, 79px) - 24px);
            overflow-y: auto;
          }
        }
        body:has(.member-config-actions-overlay,.member-config-picker-overlay,.catalog-request-form[role="dialog"]) .cookie-notice { visibility: hidden; }
        .cookie-notice__copy { min-width: 0; flex: 1 1 0; }
        .cookie-notice__copy strong { display: block; font-size: 14px; font-weight: 800; }
        .cookie-notice__copy p { margin: 5px 0 0; color: #c4c7cc; font-size: 12px; line-height: 1.55; }
        .cookie-notice__copy a { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
        .cookie-notice__actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto;min-width:0}
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
        .cookie-notice__button.secondary{background:#292a30;border:1px solid #4d4e54}
        .cookie-notice__button.secondary:hover{background:#36383e}
        .cookie-notice__button:hover { background: #b91425; }
        .cookie-notice__button:focus-visible { outline: 3px solid rgba(226, 29, 47, .5); outline-offset: 3px; }
        @media (max-width: 900px) {
          .cookie-notice { left: 12px; right: 12px; bottom: calc(var(--usd-dock-height, 0px) + max(12px, env(safe-area-inset-bottom))); align-items: stretch; flex-direction: column; gap: 12px; padding: 16px; }
          .cookie-notice__actions{flex-direction:column;align-items:stretch;width:100%}
          .cookie-notice__button { width: 100%; }
        }
      `}</style>
    </aside>
  );
}
