/* Generated at build time from audited static assets; this worker ONLY
 * controls /offline-event. Never intercept/copy authenticated responses,
 * /api, push endpoints, dynamic media or other user routes.
 */
'use strict';
const FILES=__USD_OFFLINE_ASSETS__;
const CACHE='usd-offline-static-__USD_OFFLINE_VERSION__';
const STATIC=new Set(FILES);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 // Install is not successful unless every required hashed JS/CSS chunk is cached.
 await cache.addAll(FILES.map(path=>new Request(path,{credentials:'omit',cache:'reload'})));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 for(const name of keys)
  if(name.startsWith('usd-offline-static-')&&name!==CACHE)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  if(url.pathname!=='/offline-event'&&!url.pathname.startsWith('/offline-event/'))return;
  event.respondWith((async()=>{
   try{return await fetch(request)}
   catch{
    const page=await caches.match('/index.html');
    return page??Response.error();
   }
  })());
  return;
 }
 if(!STATIC.has(url.pathname))return;
 event.respondWith((async()=>{
  const cached=await caches.match(url.pathname);
  return cached??fetch(request);
 })());
});
