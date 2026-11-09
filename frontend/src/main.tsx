import {updateExistingPushWorker} from './push/update-existing-worker';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {installAssetPreloadRecovery} from './asset-preload-recovery';
import CookieNotice from './CookieNotice';
import VelocityEffects from './public/VelocityEffects';
import './styles.css';
import './participant-ui-polish.css';
import './ui-consistency.css';
import './premium-ui.css';
import './public/premium-base.css';
import './public/premium-public.css';
import './public/premium-member.css';
import './public/premium-configurator.css';
import './participant/member-experience.css';
import './dark-velocity-sitewide.css';
import './sitewide-finish.css';
import './sitewide-premium-2026.css';
import './admin/admin-shell-layout.css';

// Handle CSS/chunk requests that race a SHA-pinned frontend image switch.
installAssetPreloadRecovery();
void updateExistingPushWorker(navigator.serviceWorker,window.location.origin);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <App />
      <CookieNotice />
      <VelocityEffects />
    </>
  </StrictMode>,
);
