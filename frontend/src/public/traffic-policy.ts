export const ANALYTICS_CONSENT_KEY='usd_traffic_analytics_consent_v1';
const MIN_INTERVAL_MS=30*60*1000;
const PUBLIC_ROUTES=new Set([
 '/', '/stages','/results','/records','/rules','/participants','/cars',
 '/news','/teams','/partners','/documents','/about','/contacts','/privacy',
 '/terms','/consent',
]);
export function publicTrafficPath(url:string):string|null{
 if(typeof url!=='string'||!url.startsWith('/'))return null;
 const path=url.split(/[?#]/,1)[0];
 const first=path.split('/').filter(Boolean)[0];
 const normalized=first?'/'+first:'/';
 return PUBLIC_ROUTES.has(normalized)?normalized:null;
}
export function mayRecordTraffic(now:number,lastAt:unknown):boolean{
 const last=Number(lastAt);
 return Number.isFinite(now)&&(lastAt===null||!Number.isFinite(last)||now-last>=MIN_INTERVAL_MS);
}
