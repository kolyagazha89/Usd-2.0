const configuredApiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/+$/, '') ?? '';
const API_BASE = configuredApiBase
  ? (/^https?:\/\//i.test(configuredApiBase)
      ? configuredApiBase
      : 'https://' + configuredApiBase.replace(/^\/+/, ''))
  : 'https://api.usd-russia.ru';

type ApiError = Error & { status?: number; debug?: string; responseBody?: unknown; requestPath?: string };
let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;
// Prevent an in-flight refresh response from restoring credentials after logout.
let authGeneration = 0;

export type Role = 'ADMIN' | 'PARTICIPANT';
export type CustomRoleInfo = { id:string; key:string; name:string; permissions:Record<string,string[]> };
export type User = { id:string; email:string; name?:string|null; role:Role; emailVerifiedAt?:string|null; participantId?:string|null; customRoleId?:string|null; customRole?:CustomRoleInfo|null };
export type AuthResponse = { success?:boolean; accessToken:string; refreshToken?:string; user:User };
export type Dashboard = {
  success:boolean; generatedAt:string;
  overview:{participants:number;cars:number;stages:number;registrations:number;results:number;records:number;appearances?:number;currentRecords?:number};
  currentStage:{id:string;stageNumber:number;name:string;city:string|null;date:string;registrationOpen:boolean;status:string}|null;
  attention:{openStages:number;pendingInspections:number;failedInspections:number;resultsToday:number;activeDisqualifications:number;unresolvedImports:number};
  activeRegistrationStats:{registrations:number;participants:number;cars:number};
  upcomingStages:Array<{id:string;stageNumber:number;name:string;city:string|null;date:string;registrationOpen:boolean}>;
  recentStages:Array<{id:string;stageNumber:number;name:string;city:string;date:string}>;
};

const REQUEST_TIMEOUT_MS = 30_000;
// Only anonymous auth endpoints should bypass refresh. Historical-profile
// search/link and authenticated account settings also live under /auth.
const PUBLIC_AUTH_ENDPOINT = /^\/auth\/(?:login|register|refresh|logout|forgot-password|reset-password|verify-email|resend-verification|confirm-email-change)(?:[/?]|$)/;

async function request<T>(path:string, init:RequestInit={}, retry=true):Promise<T>{
  const generation=authGeneration;
  const headers=new Headers(init.headers);
  if(init.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  if(accessToken) headers.set('Authorization',`Bearer ${accessToken}`);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), path.startsWith('/admin/permanent-deletion/') ? 120_000 : REQUEST_TIMEOUT_MS);

  try {
    const response=await fetch(`${API_BASE}${path}`,{
      ...init,
      headers,
      credentials:'include',
      signal:init.signal ?? controller.signal,
    });

    if(response.status===401 && retry && !PUBLIC_AUTH_ENDPOINT.test(path)){
      if(generation!==authGeneration)throw new Error('Сеанс завершён. Повторите вход.');
      const refreshed=await refresh();
      if(refreshed && generation===authGeneration) return request<T>(path,init,false);
      if(generation!==authGeneration)throw new Error('Сеанс завершён. Повторите вход.');
    }

    const data=await response.json().catch(()=>({}));
    if(generation!==authGeneration && !PUBLIC_AUTH_ENDPOINT.test(path))throw new Error('Сеанс завершён. Повторите вход.');
    if(!response.ok){
      const e=new Error(data?.message ?? 'Произошла ошибка запроса') as ApiError;
      e.status=response.status;
      e.responseBody=data;
      e.requestPath=path;
      if(new URLSearchParams(window.location.search).get('debug')==='1'){
        e.debug=JSON.stringify({type:'http_error',method:init.method??'GET',url:path,status:response.status,response:data},null,2);
        console.error('[USD DEBUG]',e.debug);
      }
      throw e;
    }
    return data as T;
  } catch (error) {
    const e=error as ApiError;
    if(new URLSearchParams(window.location.search).get('debug')==='1' && !e.debug){
      e.requestPath=path;
      e.debug=JSON.stringify({type:e.name==='AbortError'?'timeout':'network_or_browser_error',method:init.method??'GET',url:path,message:e.message,name:e.name,online:navigator.onLine,userAgent:navigator.userAgent,origin:window.location.origin,apiBase:API_BASE},null,2);
      console.error('[USD DEBUG]',e.debug,error);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
export function listData<T=any>(data:any):T[]{ if(Array.isArray(data)) return data; if(Array.isArray(data?.items)) return data.items; if(Array.isArray(data?.data)) return data.data; if(Array.isArray(data?.results)) return data.results; return []; }
export async function login(email:string,password:string){const generation=authGeneration;const r=await request<AuthResponse>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});if(generation!==authGeneration)throw new Error('Сеанс был завершён во время входа. Повторите попытку.');authGeneration++;accessToken=r.accessToken;if(r.refreshToken)localStorage.setItem('usd_refresh_token',r.refreshToken);return r.user;}
export async function refresh(){
  if(refreshPromise)return refreshPromise;
  const generation=authGeneration;
  const storedRefreshToken=localStorage.getItem('usd_refresh_token');
  const pending=request<AuthResponse>('/auth/refresh',{method:'POST',body:storedRefreshToken?JSON.stringify({refreshToken:storedRefreshToken}):undefined},false)
    .then(r=>{
      if(generation!==authGeneration)return null;
      accessToken=r.accessToken;
      if(r.refreshToken)localStorage.setItem('usd_refresh_token',r.refreshToken);
      return r;
    }).catch((error:ApiError)=>{
      if(generation!==authGeneration)return null;
      accessToken=null;
      if(error.status===401){clearAuthSession();window.dispatchEvent(new Event('usd:session-expired'));}
      return null;
    }).finally(()=>{if(refreshPromise===pending)refreshPromise=null;});
  refreshPromise=pending;
  return pending;
}
export function clearAuthSession(){
  authGeneration++;
  refreshPromise=null;
  accessToken=null;
  for(const url of privateMediaObjectUrls){URL.revokeObjectURL(url);}
  privateMediaObjectUrls.clear();
  try{localStorage.removeItem('usd_refresh_token')}catch{/* Storage may be disabled by the browser. */}
}
export async function logout(){
  // Clear immediately, before the remote request: pending refreshes must not
  // repopulate the session while the network request is still in flight.
  const refreshToken=localStorage.getItem('usd_refresh_token');
  clearAuthSession();
  try{await request('/auth/logout',{method:'POST',body:refreshToken?JSON.stringify({refreshToken}):undefined},false);}
  catch{/* Expired sessions or network errors must not block local sign-out. */}
}
export async function me(){return request<User>('/auth/me');}
export async function getDashboard(){return request<Dashboard>('/statistics/dashboard');}
export async function getStageStatistics(stageId:string){return request<any>('/statistics/stages/'+encodeURIComponent(stageId));}
export async function getDataQuality(){return request<{success:boolean;generatedAt:string;counts:{total:number;error:number;warning:number;info:number};healthy:boolean;issues?:any[]}>('/statistics/data-quality/report');}
export async function prepareHistoricalImport(){return apiPost<any>('/imports/historical/prepare',{});}
export async function getAudit(page=1,limit=50,entity='',action=''){const q=new URLSearchParams({page:String(page),limit:String(limit)});if(entity)q.set('entity',entity);if(action)q.set('action',action);return request<any>(`/statistics/audit?${q}`);}
export async function apiGet<T=any>(path:string){return request<T>(path);}
export async function apiPost<T=any>(path:string,body:any){return request<T>(path,{method:'POST',body:JSON.stringify(body)});}
export async function apiPatch<T=any>(path:string,body:any){return request<T>(path,{method:'PATCH',body:JSON.stringify(body)});}
export async function apiPut<T=any>(path:string,body:any){return request<T>(path,{method:'PUT',body:JSON.stringify(body)});}
export async function apiDelete<T=any>(path:string){return request<T>(path,{method:'DELETE'});}

const privateMediaObjectUrls = new Set<string>();
export function releasePrivateMediaUrl(url:string){if(privateMediaObjectUrls.delete(url))URL.revokeObjectURL(url);}
export async function getPrivateMediaObjectUrl(targetType:string,targetId:string):Promise<string>{
  const path='/media/private-file/'+encodeURIComponent(targetType)+'/'+encodeURIComponent(targetId);
  const read=async(retry:boolean):Promise<string>=>{
    const generation=authGeneration;
    const headers=new Headers();
    if(accessToken)headers.set('Authorization',`Bearer ${accessToken}`);
    const response=await fetch(`${API_BASE}${path}`,{headers,credentials:'include'});
    if(response.status===401&&retry){
      if(generation!==authGeneration)throw new Error('Сеанс завершён. Повторите вход.');
      const renewed=await refresh();
      if(renewed && generation===authGeneration)return read(false);
      if(generation!==authGeneration)throw new Error('Сеанс завершён. Повторите вход.');
    }
    if(generation!==authGeneration)throw new Error('Сеанс завершён. Повторите вход.');
    if(!response.ok)throw new Error('Не удалось получить медиафайл ('+response.status+')');
    const blob=await response.blob();
    if(generation!==authGeneration)throw new Error('Сеанс завершён. Повторите вход.');
    const url=URL.createObjectURL(blob);
    privateMediaObjectUrls.add(url);
    return url;
  };
  if(!accessToken){
    const generation=authGeneration;
    await refresh();
    if(generation!==authGeneration)throw new Error('Сеанс завершён. Повторите вход.');
  }
  return read(true);
}
export async function getMediaUrl(targetType:string,targetId:string){
  if(targetType==='SITE_ASSET')return `${API_BASE}/media/public-file/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`;
  return getPrivateMediaObjectUrl(targetType,targetId);
}

export async function getSiteSettings(){return apiGet<any>('/site-settings');}
export async function getPublicSiteSettings(){return apiGet<any>('/site-settings/public');}
export async function updateSiteSettings(body:any){return apiPatch<any>('/site-settings',body);}
export async function prepareMediaUpload(targetType:string,targetId:string,contentType:string){return apiPost<any>('/media/prepare',{targetType,targetId,contentType});}
export async function completeMediaUpload(uploadToken:string){return apiPost<any>('/media/complete',{uploadToken});}
export async function getPublicMediaUrl(targetType:string){const r=await apiGet<{success:boolean;url:string}>(`/media/public/${encodeURIComponent(targetType)}/default`);return r.url;}
export function getPublicEntityPhotoUrl(targetType:'PARTICIPANT_PHOTO'|'CAR_PHOTO',targetId:string){return `${API_BASE}/media/public-file/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`;}

export async function getGoogleStatus(){return request<any>('/google/status');}
export async function connectGoogle(){const r=await request<{success:boolean;authorizationUrl:string}>('/google/connect');window.location.href=r.authorizationUrl;}
export async function getGoogleSpreadsheets(){return request<any>('/google/spreadsheets');}
export async function getGoogleSpreadsheet(id:string){return request<any>('/google/spreadsheets/'+encodeURIComponent(id));}
export async function getGoogleSheetValues(id:string,sheet:string){return request<any>('/google/spreadsheets/'+encodeURIComponent(id)+'/values?sheet='+encodeURIComponent(sheet));}

export async function findHistoricalProfileCandidates(fullName:string){
  return apiPost<any>('/auth/profile/historical-candidates',{fullName});
}
export async function linkHistoricalProfile(participantId:string){
  return apiPost<any>('/auth/profile/link-historical',{participantId});
}


export async function chatAssistant(message:string){return apiPost<any>('/assistant/chat',{message});}
export async function getAssistantRequests(){return apiGet<any>('/assistant/requests');}
export async function createAssistantRequest(body:any){return apiPost<any>('/assistant/requests',body);}
export async function submitAssistantRequest(id:string){return apiPatch<any>('/assistant/requests/'+encodeURIComponent(id)+'/submit',{});}
export async function approveAssistantRequest(id:string,confirmation:string){return apiPatch<any>('/assistant/requests/'+encodeURIComponent(id)+'/approve',{confirmation});}
export async function rejectAssistantRequest(id:string){return apiPatch<any>('/assistant/requests/'+encodeURIComponent(id)+'/reject',{});}
export async function applyAssistantRequest(id:string){return apiPatch<any>('/assistant/requests/'+encodeURIComponent(id)+'/apply',{});}
export async function getAssistantFunctions(){return apiGet<any>('/assistant/functions');}
export async function executeAssistantFunction(code:string,body:any={}){return apiPost<any>('/assistant/functions/'+encodeURIComponent(code)+'/execute',body);}

export async function uploadSiteAsset(assetKey:string,file:File){
  if(!file.type) throw new Error('Не удалось определить тип изображения');
  if(file.size<=0) throw new Error('Файл пустой');
  if(file.size>10*1024*1024) throw new Error('Размер изображения не должен превышать 10 МБ');
  const debug=new URLSearchParams(window.location.search).get('debug')==='1';
  const log=(step:string,extra:any={})=>{if(debug)console.info('[USD MEDIA DEBUG]',JSON.stringify({step,assetKey,file:{name:file.name,type:file.type,size:file.size},...extra},null,2));};
  log('start');
  try{
    const prepared=await apiPost<any>('/media/prepare',{targetType:'SITE_ASSET',targetId:assetKey,contentType:file.type});
    log('prepared',{uploadTokenPresent:Boolean(prepared?.uploadToken),preparedKeys:Object.keys(prepared??{})});
    await request<any>('/media/upload',{method:'PUT',headers:{'Content-Type':file.type,'X-Upload-Token':prepared.uploadToken},body:file},false);
    log('uploaded');
    // /media/upload validates and completes the upload on the API side.
    log('completed');
    const url=`${API_BASE}/media/public-file/SITE_ASSET/${encodeURIComponent(assetKey)}`;
    log('view_ready',{url});
    return { url, publicPath:url };
  }catch(error){
    log('failed',{error:String(error),debug:(error as ApiError)?.debug});
    throw error;
  }
}
export async function getPublicSiteAsset(assetKey:string){return {success:true,url:`${API_BASE}/media/public-file/SITE_ASSET/${encodeURIComponent(assetKey)}`};}

export async function uploadEntityPhoto(targetType:'PARTICIPANT_PHOTO'|'CAR_PHOTO',targetId:string,file:File){
  const allowed=['image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type))throw new Error('Разрешены только JPG, PNG и WebP');
  if(file.size<=0||file.size>10*1024*1024)throw new Error('Размер фотографии должен быть от 1 байта до 10 МБ');
  const prepared=await apiPost<any>('/media/prepare',{targetType,targetId,contentType:file.type});
  if(!prepared?.uploadToken)throw new Error('Сервер не подготовил загрузку фотографии');
  await request<any>('/media/upload',{method:'PUT',headers:{'Content-Type':file.type,'X-Upload-Token':prepared.uploadToken},body:file},false);
  return {photoUrl:prepared.photoUrl??null,url:await getMediaUrl(targetType,targetId)};
}


export async function uploadRulesDocx(targetId:string,file:File){
  const contentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if(file.size<=0||file.size>10*1024*1024) throw new Error('Размер DOCX должен быть от 1 байта до 10 МБ');
  if(!file.name.toLowerCase().endsWith('.docx')) throw new Error('Разрешён только формат .docx');
  const prepared=await apiPost<any>('/media/prepare',{targetType:'SITE_ASSET',targetId,contentType});
  await request<any>('/media/upload',{method:'PUT',headers:{'Content-Type':contentType,'X-Upload-Token':prepared.uploadToken},body:file},false);
  // /media/upload already completes the upload; calling /media/complete again invalidates the consumed token.
  return {url:`${API_BASE}/media/public-file/SITE_ASSET/${encodeURIComponent(targetId)}`,targetId};
}

export async function createComponentCatalogRequest(body:{category:string;brand:string;model:string;details?:string}){return apiPost<any>('/component-catalog-requests',body);}
export async function getComponentCatalogRequests(){return apiGet<any>('/component-catalog-requests');}
export async function approveComponentCatalogRequest(id:string,adminNote?:string){return apiPatch<any>('/component-catalog-requests/'+encodeURIComponent(id)+'/approve',{adminNote});}
export async function rejectComponentCatalogRequest(id:string,adminNote?:string){return apiPatch<any>('/component-catalog-requests/'+encodeURIComponent(id)+'/reject',{adminNote});}

export async function retryComponentCatalogRequestEmail(id:string){return apiPost<any>('/component-catalog-requests/'+encodeURIComponent(id)+'/retry-email',{});}
