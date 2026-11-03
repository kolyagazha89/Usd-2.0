/** Recover from a Vite lazy-chunk/CSS preload race while the home-PC frontend
 * image changes. Never continuously refresh on an actual outage.
 */
export const ASSET_RETRY_KEY='usd:asset-preload-retry-at';
export const ASSET_RETRY_COOLDOWN_MS=120_000;

export function mayRetryAssetPreload(lastValue:string|null,now:number):boolean{
 if(lastValue===null)return true;
 const last=Number(lastValue);
 return !Number.isFinite(last)||last<=0||now<last||now-last>=ASSET_RETRY_COOLDOWN_MS;
}

function manualRecoveryNotice():void{
 if(document.querySelector('[data-usd-asset-recovery]'))return;
 const notice=document.createElement('aside');
 notice.dataset.usdAssetRecovery='true';
 notice.setAttribute('role','alert');
 notice.setAttribute('aria-live','assertive');
 notice.style.cssText=[
  'position:fixed','z-index:11000','inset:auto 12px max(14px, env(safe-area-inset-bottom))',
  'width:min(440px, calc(100vw - 24px))','margin-inline:auto',
  'padding:16px','border:1px solid #6c3037','border-radius:14px',
  'background:#17191e','box-shadow:0 12px 36px #0009',
  'color:#f7f8fa','font:500 15px/1.45 system-ui,sans-serif',
 ].join(';');
 const description=document.createElement('p');
 description.textContent='USD обновился во время загрузки. Обновите страницу, чтобы открыть актуальную версию.';
 description.style.cssText='margin:0 0 12px';
 const button=document.createElement('button');
 button.type='button';
 button.textContent='Обновить страницу';
 button.style.cssText='padding:10px 15px;border:0;border-radius:9px;background:#b62132;color:#fff;font:700 15px system-ui,sans-serif;cursor:pointer';
 button.addEventListener('click',()=>window.location.reload());
 notice.append(description,button);
 document.body.append(notice);
}

/** Called once in the app entrypoint, before lazy route rendering. */
export function installAssetPreloadRecovery():void{
 if(typeof window==='undefined'||typeof document==='undefined')return;
 window.addEventListener('vite:preloadError',(event)=>{
  // Vite otherwise rejects the lazy import and can leave a blank content area.
  event.preventDefault();
  try{
   const storage=window.sessionStorage;
   const now=Date.now();
   if(mayRetryAssetPreload(storage.getItem(ASSET_RETRY_KEY),now)){
    storage.setItem(ASSET_RETRY_KEY,String(now));
    window.location.reload();
    return;
   }
  }catch{
   // Private browsing can deny storage. Never enter a blind reload loop.
  }
  manualRecoveryNotice();
 });
}
