const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type ApiError = Error & { status?: number };
let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;

export type Role = 'ADMIN' | 'JUDGE' | 'PARTICIPANT';
export type User = { id:string; email:string; name?:string|null; role:Role; emailVerifiedAt?:string|null; participantId?:string|null };
export type AuthResponse = { success?:boolean; accessToken:string; user:User };
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

async function request<T>(path:string, init:RequestInit={}, retry=true):Promise<T>{
  const headers=new Headers(init.headers);
  if(init.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  if(accessToken) headers.set('Authorization',`Bearer ${accessToken}`);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response=await fetch(`${API_BASE}${path}`,{
      ...init,
      headers,
      credentials:'include',
      signal:init.signal ?? controller.signal,
    });

    if(response.status===401 && retry && !path.startsWith('/auth/')){
      const refreshed=await refresh();
      if(refreshed) return request<T>(path,init,false);
    }

    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const e=new Error(data?.message ?? 'Произошла ошибка запроса') as ApiError;
      e.status=response.status;
      throw e;
    }
    return data as T;
  } finally {
    window.clearTimeout(timeout);
  }
}
export function listData<T=any>(data:any):T[]{ if(Array.isArray(data)) return data; if(Array.isArray(data?.items)) return data.items; if(Array.isArray(data?.data)) return data.data; if(Array.isArray(data?.results)) return data.results; return []; }
export async function login(email:string,password:string){const r=await request<AuthResponse>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});accessToken=r.accessToken;return r.user;}
export async function refresh(){if(refreshPromise)return refreshPromise;refreshPromise=request<AuthResponse>('/auth/refresh',{method:'POST'},false).then(r=>{accessToken=r.accessToken;return r;}).catch(()=>{accessToken=null;return null;}).finally(()=>{refreshPromise=null;});return refreshPromise;}
export async function logout(){try{await request('/auth/logout',{method:'POST'},false);}finally{accessToken=null;}}
export async function me(){return request<User>('/auth/me');}
export async function getDashboard(){return request<Dashboard>('/statistics/dashboard');}
export async function getStageStatistics(stageId:string){return request<any>('/statistics/stages/'+encodeURIComponent(stageId));}
export async function getDataQuality(){return request<{success:boolean;generatedAt:string;counts:{total:number;error:number;warning:number;info:number};healthy:boolean;issues?:any[]}>('/statistics/data-quality/report');}
export async function getAudit(page=1,limit=50,entity='',action=''){const q=new URLSearchParams({page:String(page),limit:String(limit)});if(entity)q.set('entity',entity);if(action)q.set('action',action);return request<any>(`/statistics/audit?${q}`);}
export async function apiGet<T=any>(path:string){return request<T>(path);}
export async function apiPost<T=any>(path:string,body:any){return request<T>(path,{method:'POST',body:JSON.stringify(body)});}
export async function apiPatch<T=any>(path:string,body:any){return request<T>(path,{method:'PATCH',body:JSON.stringify(body)});}
export async function apiPut<T=any>(path:string,body:any){return request<T>(path,{method:'PUT',body:JSON.stringify(body)});}
export async function apiDelete<T=any>(path:string){return request<T>(path,{method:'DELETE'});}

export async function getMediaUrl(targetType:string,targetId:string){const r=await apiGet<{success:boolean;url:string}>(`/media/view/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`);return r.url;}

export async function getSiteSettings(){return apiGet<any>('/site-settings');}
export async function updateSiteSettings(body:any){return apiPatch<any>('/site-settings',body);}
export async function prepareMediaUpload(targetType:string,targetId:string,contentType:string){return apiPost<any>('/media/prepare',{targetType,targetId,contentType});}
export async function completeMediaUpload(uploadToken:string){return apiPost<any>('/media/complete',{uploadToken});}
export async function getPublicMediaUrl(targetType:string){const r=await apiGet<{success:boolean;url:string}>(`/media/public/${encodeURIComponent(targetType)}/default`);return r.url;}

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
  const prepared=await apiPost<any>('/media/prepare',{targetType:'SITE_ASSET',targetId:assetKey,contentType:file.type});
  let directUploadOk=false;
  try{
    const upload=await fetch(prepared.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type},body:file});
    directUploadOk=upload.ok;
  }catch{}
  if(!directUploadOk){
    await request<any>('/media/upload',{method:'PUT',headers:{'Content-Type':file.type,'X-Upload-Token':prepared.uploadToken},body:file},false);
  }else{
    await apiPost<any>('/media/complete',{uploadToken:prepared.uploadToken});
  }
  const view=await apiGet<any>('/media/view/SITE_ASSET/'+encodeURIComponent(assetKey));
  return { url:view.url, publicPath:'/media/public/SITE_ASSET/'+encodeURIComponent(assetKey) };
}
export async function getPublicSiteAsset(assetKey:string){return apiGet<any>('/media/public/SITE_ASSET/'+encodeURIComponent(assetKey));}
