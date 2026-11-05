/** A bounded replay for anonymous read endpoints that can intermittently fail
 * behind the local prerelease edge. Do not retry mutations or session reads:
 * refreshing credentials/logout must never be duplicated by this layer.
 */
const RETRYABLE_PUBLIC_READ=/^\/(?:records\/current|stages\/public|site-settings\/public)(?:\?.*)?$/;
const RETRYABLE_STATUSES=new Set([502,503,504]);

export async function fetchWithPublicReadRetry(
 path:string,
 url:string,
 init:RequestInit,
 fetcher:typeof fetch=fetch,
):Promise<Response>{
 const method=String(init.method??'GET').toUpperCase();
 const eligible=method==='GET'&&RETRYABLE_PUBLIC_READ.test(path);
 let attempt=0;
 for(;;){
  try{
   const response=await fetcher(url,init);
   if(!eligible||attempt>=1||!RETRYABLE_STATUSES.has(response.status)||init.signal?.aborted)return response;
   await response.body?.cancel().catch(()=>undefined);
  }catch(error){
   // Only transport errors are replayable. AbortError and caller cancellation
   // are terminal and preserve the existing request timeout.
   if(!eligible||attempt>=1||init.signal?.aborted||!(error instanceof TypeError))throw error;
  }
  attempt++;
 }
}
