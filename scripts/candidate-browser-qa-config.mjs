// Candidate UI tests must intercept the current API as well as legacy builds.
// Every other remote request remains blocked by the browser test router.
export function isCandidateApiRequest(value){
 try{
  const url=value instanceof URL?value:new URL(value);
  return url.protocol==='https:'&&['api.usd-russia.ru','usd-api-production.up.railway.app'].includes(url.hostname);
 }catch{return false}
}
