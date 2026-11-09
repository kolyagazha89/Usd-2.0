/** Update the installed push-only worker after a release, preserving its
 * subscription and consent. Never register over a different/offline worker.
 */
export async function updateExistingPushWorker(container:Pick<ServiceWorkerContainer,'getRegistration'>|undefined,origin:string):Promise<void>{
 if(!container)return;
 try{
  const registration=await container.getRegistration(origin+'/');
  const worker=registration?.installing??registration?.waiting??registration?.active;
  if(!worker)return;
  const url=new URL(worker.scriptURL);
  if(url.origin===origin&&url.pathname==='/usd-push-sw.js')await registration!.update();
 }catch{/* Offline or disabled service workers must never delay app startup. */}
}
