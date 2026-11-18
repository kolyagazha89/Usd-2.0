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
import './approved-public-refresh.css';
import './participant/member-experience.css';
import './dark-velocity-sitewide.css';
import './sitewide-finish.css';
import './sitewide-premium-2026.css';
import './admin/admin-shell-layout.css';

// Keep the LAN spectator display free of consent modals, scrolling effects
// and service-worker update attempts. It has no account or write workflow.
const venueTv=window.location.pathname==='/venue/live'
 && (window as Window&{__USD_VENUE_MODE__?:unknown}).__USD_VENUE_MODE__===true;

// Handle CSS/chunk requests that race a SHA-pinned frontend image switch.
installAssetPreloadRecovery();
if(!venueTv)void updateExistingPushWorker(navigator.serviceWorker,window.location.origin);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <App />
      {!venueTv&&<CookieNotice/>}
      {!venueTv&&<VelocityEffects/>}
    </>
  </StrictMode>,
);
