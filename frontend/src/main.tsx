import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import CookieNotice from './CookieNotice';
import './styles.css';
import './participant-ui-polish.css';
import './ui-consistency.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <Suspense fallback={<div className="center-page" role="status" aria-live="polite">Загружаем USD…</div>}><App /></Suspense>
      <CookieNotice />
    </>
  </StrictMode>,
);
