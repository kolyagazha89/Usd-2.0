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
 // The independent venue LAN stack also runs NODE_ENV=production, but has
 // HTTPS on a private IP and intentionally no public DNS or external API.
 // Never rewrite its account/inspection links to the Internet.
 if(runtime==='production'&&process.env.USD_VENUE_LAN_MODE==='true'){
  let parsed:URL;
  try{parsed=new URL(value)}catch{throw new Error('Unapproved venue public origin')}
  const octets=parsed.hostname.split('.').map(Number);
  const privateIpv4=octets.length===4&&octets.every(n=>Number.isInteger(n)&&n>=0&&n<=255)
   &&(octets[0]===10||(octets[0]===172&&octets[1]>=16&&octets[1]<=31)
     ||(octets[0]===192&&octets[1]===168));
  if(!privateIpv4||parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port
    ||parsed.pathname!=='/'||parsed.search||parsed.hash||value!==parsed.origin)
   throw new Error('Unapproved venue public origin');
  return parsed.origin;
 }
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
