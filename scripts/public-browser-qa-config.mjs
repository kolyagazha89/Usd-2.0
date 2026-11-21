export function getLiveQaConfig(env=process.env){
 const preview=env.USD_QA_CANDIDATE_CSS;
 if(preview!==undefined&&preview!==''&&preview!=='1')throw new Error('USD_QA_CANDIDATE_CSS must be unset or 1');
 const injectCandidateCss=preview==='1';
 const width=env.USD_LIVE_QA_WIDTH;
 if(width!==undefined&&width!=='1440'&&width!=='390')throw new Error('USD_LIVE_QA_WIDTH must be 1440 or 390');
 const widths=width===undefined?[1440,390]:[Number(width)];
 return {
  base:'https://usd-russia.ru',
  injectCandidateCss,
  widths,
  visualSource:injectCandidateCss
   ?'live DOM with candidate CSS preview; not deployment acceptance'
   :'deployed site, unmodified styles',
 };
}

// Live QA reads the verified primary USD site and API, never sends mutations.
export function isLiveQaReadRequest(value,method){
 try{
  const url=new URL(value);
  return ['GET','HEAD','OPTIONS'].includes(method)&&url.protocol==='https:'
   &&!url.username&&!url.password&&['usd-russia.ru','api.usd-russia.ru'].includes(url.hostname);
 }catch{return false}
}
