/** The normal release always uses its built public API origin.
 * A deliberately mounted LAN-only bootstrap may opt into the same-origin
 * /venue-api proxy. If that bootstrap is malformed we fail closed rather than
 * sending private venue mutations to the internet.
 */
export function resolveUsdApiBase(buildBase:unknown,venueMode:unknown,venueApiBase:unknown):string {
 if(venueMode===true){
  if(venueApiBase!=='/venue-api')throw new Error('Неверная конфигурация локального сервера USD. Обратитесь к организатору.');
  return '/venue-api';
 }
 const configured=typeof buildBase==='string'?buildBase.trim().replace(/\/+$/,''):'';
 if(!configured)return 'https://api.usd-russia.ru';
 return /^https?:\/\//i.test(configured)
  ?configured:'https://'+configured.replace(/^\/+/, '');
}
