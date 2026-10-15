import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import CookieNotice from './CookieNotice';
import './styles.css';
import './participant-ui-polish.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <App />
      <CookieNotice />
    </>
  </StrictMode>,
);
