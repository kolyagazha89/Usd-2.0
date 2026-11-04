import {isLiveQaReadRequest} from './public-browser-qa-config.mjs';

/**
 * Recheck failed browser subresource GETs from a clean read-only network
 * context. An in-flight Playwright route.fetch can die because the browser
 * navigated away; that is not evidence of a broken production endpoint.
 * A persistent error on an isolated request, however, fails release QA.
 *
 * All requests are HTTPS GET to the existing prerelease allowlist, redirects
 * are never followed, and no bearer headers, cookies or write methods pass.
 */
export async function recheckFailedPublicReads(blockedRequests, request=fetch) {
  const recovered=[],unresolved=[];
  const failed=blockedRequests.filter(item=>item.reason==='read failed');
  const unique=new Map(failed.map(item=>[item.method+' '+item.url,item]));
  for(const item of unique.values()) {
    if(item.method!=='GET'||!isLiveQaReadRequest(item.url,item.method)) {
      unresolved.push({url:item.url,reason:'Read probe target is not approved'});
      continue;
    }
    let passed=false,reason='Read remained unavailable';
    for(let attempt=1;attempt<=2;attempt++) {
      try {
        const response=await request(item.url,{
          method:'GET',
          redirect:'manual',
          cache:'no-store',
          headers:{'Accept':'application/json, image/*, application/octet-stream'},
          signal:AbortSignal.timeout(8000),
        });
        if(response.status>=300&&response.status<400){
          reason='Read probe unexpectedly redirected';
          break;
        }
        if(response.status!==200){
          reason='Read probe returned HTTP '+response.status;
          if(![429,500,502,503,504].includes(response.status))break;
          continue;
        }
        const type=response.headers.get('content-type')??'';
        const url=new URL(item.url);
        if(url.pathname==='/records/current'||url.pathname==='/stages/public'){
          if(!type.includes('application/json')) {
            reason='Public list returned unexpected content type';
            break;
          }
          const length=Number(response.headers.get('content-length')??'0');
          if(!Number.isFinite(length)||length>1024*1024*2){
            reason='Public list response exceeds 2 MB';
            break;
          }
          const payload=await response.json();
          if(!Array.isArray(payload)){
            reason='Public list response is not an array';
            break;
          }
        } else {
          if(url.pathname.startsWith('/media/public-file/')&&!(
            type.startsWith('image/')||type.includes('officedocument.wordprocessingml.document')
          )){
            reason='Public media returned unexpected content type';
            break;
          }
          const reader=response.body?.getReader();
          if(!reader){
            reason='Public asset returned no response stream';
            break;
          }
          const first=await reader.read();
          await reader.cancel().catch(()=>{});
          if(first.done||!first.value?.byteLength){
            reason='Public asset was empty';
            break;
          }
        }
        recovered.push({url:item.url,attempts:attempt});
        passed=true;
        break;
      } catch {
        reason='Isolated HTTPS GET failed';
      }
    }
    if(!passed)unresolved.push({url:item.url,reason});
  }
  return {recovered,unresolved};
}
