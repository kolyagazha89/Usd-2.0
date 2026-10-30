export function getLiveQaConfig(env=process.env){
 const preview=env.USD_QA_CANDIDATE_CSS;
 if(preview!==undefined&&preview!==''&&preview!=='1')throw new Error('USD_QA_CANDIDATE_CSS must be unset or 1');
 const injectCandidateCss=preview==='1';
 return {
  base:'https://app.usd-russia.ru',
  injectCandidateCss,
  visualSource:injectCandidateCss
   ?'live DOM with candidate CSS preview; not deployment acceptance'
   :'deployed site, unmodified styles',
 };
}

// Live QA must never visit the primary site or send a mutation to production.
export function isLiveQaReadRequest(value,method){
 try{
  const url=new URL(value);
  return ['GET','HEAD','OPTIONS'].includes(method)&&url.protocol==='https:'
   &&!url.username&&!url.password&&['app.usd-russia.ru','api.usd-russia.ru'].includes(url.hostname);
 }catch{return false}
}
