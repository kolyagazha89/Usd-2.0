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
