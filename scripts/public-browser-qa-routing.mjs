import {isLiveQaReadRequest} from './public-browser-qa-config.mjs';

export async function handleLiveQaRoute(route,blockedRequests){
 const request=route.request();
 const url=new URL(request.url());
 const record=reason=>blockedRequests.push({method:request.method(),url:url.origin+url.pathname,reason});
 if(!isLiveQaReadRequest(url.href,request.method())){
  record('unapproved request');
  // Anonymous bootstrap stays synthetic; no live POST is sent.
  if(url.hostname==='api.usd-russia.ru'&&url.pathname==='/auth/refresh')return route.fulfill({status:401,contentType:'application/json',body:'{"message":"Anonymous QA session"}'});
  return route.abort('blockedbyclient');
 }
 // Playwright routing skips subsequent HTTP redirect hops, even when a 302 is
 // fulfilled manually. Never give the browser a redirect it could follow to
 // the primary site or another unapproved service.
 let response;
 // The live media store can intermittently close a read while the prerelease
 // page is loading. Retry one safe GET for public media only; persistent
 // failures still fail the browser QA. Redirects are never followed or retried.
 const attempts=request.method()==='GET'&&url.pathname.startsWith('/media/public-file/')?2:1;
 for(let attempt=0;attempt<attempts;attempt++){
  try{response=await route.fetch({maxRedirects:0});break}
  catch{
   if(attempt===attempts-1){
    record('read failed');
    return route.abort('failed');
   }
  }
 }
 if([301,302,303,307,308].includes(response.status())){
  record('redirect');
  return route.abort('blockedbyclient');
 }
 return route.fulfill({response});
}
