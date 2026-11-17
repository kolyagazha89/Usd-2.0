/** Public address of the single USD organization after the owner approved apex cutover.
 * The protected Ubuntu release environment still identifies the old app host
 * internally for backup and deploy safety. That must not leak into new emails,
 * confirmation redirects, notifications, sitemap or Google callbacks.
 *
 * Only the two exact owner-controlled HTTPS origins may select the public
 * production destination. Unknown or userinfo-containing URLs fail closed.
 * Development and test behavior is unchanged for isolated preview fixtures.
 */
export const USD_PUBLIC_ORIGIN='https://usd-russia.ru';
const USD_LEGACY_ORIGIN='https://app.usd-russia.ru';

export function publicUsdSiteOrigin(configured?:string,runtime=process.env.NODE_ENV):string{
 const value=(configured??'').trim();
 if(runtime==='production'){
  if(!value)return USD_PUBLIC_ORIGIN;
  let parsed:URL;
  try{parsed=new URL(value)}catch{throw new Error('Unapproved USD public origin')}
  if((parsed.origin!==USD_PUBLIC_ORIGIN&&parsed.origin!==USD_LEGACY_ORIGIN)
    ||parsed.username||parsed.password||parsed.search||parsed.hash
    ||parsed.pathname!=='/'||!/^https:\/\/[^/?#]+\/?$/.test(value))
   throw new Error('Unapproved USD public origin');
  return USD_PUBLIC_ORIGIN;
 }
 return value.replace(/\/+$/,'')||'http://localhost:5173';
}
