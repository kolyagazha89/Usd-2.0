import {trackPublicTrafficView} from '../api';
import {ANALYTICS_CONSENT_KEY,publicTrafficPath,mayRecordTraffic} from './traffic-policy';
export async function recordConsentedTrafficVisit(path:string):Promise<void>{
 const route=publicTrafficPath(path);
 if(!route||typeof window==='undefined'||!window.navigator.onLine||
  window.navigator.doNotTrack==='1')return;
 try{
  if(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)!=='yes')return;
  const key='usd_traffic_visited:'+route;
  const last=window.sessionStorage.getItem(key),now=Date.now();
  if(!mayRecordTraffic(now,last))return;
  window.sessionStorage.setItem(key,String(now));
  try{await trackPublicTrafficView(route)}
  catch{window.sessionStorage.removeItem(key)}
 }catch{/* Without local/session storage, never track. */}
}
