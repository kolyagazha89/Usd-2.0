import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import CookieNotice from './CookieNotice';
import './styles.css';
import './participant-ui-polish.css';
import './ui-consistency.css';
import './premium-ui.css';
import './public/premium-base.css';
import './public/premium-public.css';
import './public/premium-member.css';
import './public/premium-configurator.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <App />
      <CookieNotice />
    </>
  </StrictMode>,
);
