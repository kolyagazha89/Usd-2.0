const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type ApiError = Error & { status?: number };
let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;

export type Role = 'ADMIN' | 'JUDGE' | 'PARTICIPANT';
export type User = { id:string; email:string; name?:string|null; role:Role; emailVerifiedAt?:string|null; participantId?:string|null };
export type AuthResponse = { success?:boolean; accessToken:string; user:User };
export type Dashboard = {
  success:boolean; generatedAt:string;
  overview:{participants:number;cars:number;stages:number;registrations:number;results:number;records:number};
  attention:{openStages:number;pendingInspections:number;failedInspections:number;resultsToday:number;activeDisqualifications:number;unresolvedImports:number};
  upcomingStages:Array<{id:string;stageNumber:number;name:string;city:string;date:string;registrationOpen:boolean}>;
  recentStages:Array<{id:string;stageNumber:number;name:string;city:string;date:string}>;
};

async function request<T>(path:string, init:RequestInit={}, retry=true):Promise<T>{
  const headers=new Headers(init.headers);
  if(init.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  if(accessToken) headers.set('Authorization',`Bearer ${accessToken}`);
  const response=await fetch(`${API_BASE}${path}`,{...init,headers,credentials:'include'});
  if(response.status===401 && retry && !path.startsWith('/auth/')){
    const refreshed=await refresh();
    if(refreshed) return request<T>(path,init,false);
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(data?.message ?? 'Произошла ошибка запроса') as ApiError;e.status=response.status;throw e;}
  return data as T;
}
export function listData<T=any>(data:any):T[]{ if(Array.isArray(data)) return data; if(Array.isArray(data?.items)) return data.items; if(Array.isArray(data?.data)) return data.data; if(Array.isArray(data?.results)) return data.results; return []; }
export async function login(email:string,password:string){const r=await request<AuthResponse>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});accessToken=r.accessToken;return r.user;}
export async function refresh(){if(refreshPromise)return refreshPromise;refreshPromise=request<AuthResponse>('/auth/refresh',{method:'POST'},false).then(r=>{accessToken=r.accessToken;return r;}).catch(()=>{accessToken=null;return null;}).finally(()=>{refreshPromise=null;});return refreshPromise;}
export async function logout(){try{await request('/auth/logout',{method:'POST'},false);}finally{accessToken=null;}}
export async function me(){return request<User>('/auth/me');}
export async function getDashboard(){return request<Dashboard>('/statistics/dashboard');}
export async function getDataQuality(){return request<{success:boolean;generatedAt:string;counts:{total:number;error:number;warning:number;info:number};healthy:boolean;issues?:any[]}>('/statistics/data-quality/report');}
export async function getAudit(page=1,limit=50,entity='',action=''){const q=new URLSearchParams({page:String(page),limit:String(limit)});if(entity)q.set('entity',entity);if(action)q.set('action',action);return request<any>(`/statistics/audit?${q}`);}
export async function apiGet<T=any>(path:string){return request<T>(path);}
export async function apiPost<T=any>(path:string,body:any){return request<T>(path,{method:'POST',body:JSON.stringify(body)});}
export async function apiPatch<T=any>(path:string,body:any){return request<T>(path,{method:'PATCH',body:JSON.stringify(body)});}
export async function apiPut<T=any>(path:string,body:any){return request<T>(path,{method:'PUT',body:JSON.stringify(body)});}
export async function apiDelete<T=any>(path:string){return request<T>(path,{method:'DELETE'});}

export async function getMediaUrl(targetType:string,targetId:string){const r=await apiGet<{success:boolean;url:string}>(`/media/view/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`);return r.url;}
