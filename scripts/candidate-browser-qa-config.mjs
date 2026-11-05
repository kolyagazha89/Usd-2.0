// Candidate UI tests must intercept the self-hosted API.
// Every other remote request remains blocked by the browser test router.
export function isCandidateApiRequest(value){
 try{
  const url=value instanceof URL?value:new URL(value);
  return url.protocol==='https:'&&['api.usd-russia.ru'].includes(url.hostname);
 }catch{return false}
}

export function getCandidateQaOptions(env=process.env){
 const raw=env.USD_CANDIDATE_QA_WIDTHS;
 const widths=raw===undefined?[1440,1024,390,320]:raw.split(',').map(value=>Number(value.trim()));
 if(widths.length<1||widths.length>8||new Set(widths).size!==widths.length||widths.some(width=>!Number.isInteger(width)||width<320||width>3840))throw new Error('Invalid candidate viewport matrix');
 return {widths,axe:env.USD_CANDIDATE_QA_AXE==='1'};
}
