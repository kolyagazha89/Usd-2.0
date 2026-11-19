#!/usr/bin/env node
/** One-time RustFS bootstrap for the isolated USD venue. Runs INSIDE the
 * temporary API CLI container, on the private Docker network only.
 * Root credentials are never passed to the running API container.
 */
import {createHash,createHmac} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const BUCKET='usd-venue-media';
const ENDPOINT='http://rustfs:9000';
const POLICY_NAME='usd-venue-media-only';
const sha=value=>createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
const awsEncode=value=>encodeURIComponent(value).replace(/[!'()*]/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase());

export function venueMediaPolicy(){
 return {
  Version:'2012-10-17',
  Statement:[
   // Default deny: no permissions outside this exact bucket are granted.
   // Explicit global Deny on Resource "*" is rejected by RustFS 1.0.4
   // with 400 when creating a canned policy; verify the boundary below.
   {Effect:'Allow',Action:['s3:ListBucket','s3:GetBucketLocation','s3:ListBucketMultipartUploads'],
    Resource:['arn:aws:s3:::'+BUCKET]},
   {Effect:'Allow',Action:['s3:GetObject','s3:PutObject','s3:DeleteObject',
    's3:AbortMultipartUpload','s3:ListMultipartUploadParts'],
    Resource:['arn:aws:s3:::'+BUCKET+'/*']},
  ],
 };
}

/** S3/RustFS admin v3 use AWS Signature V4; never log auth headers. */
export function signRustfsRequest({
 method,endpoint=ENDPOINT,path='/',query={},body='',accessKey,secretKey,now=new Date(),
}){
 if(endpoint!==ENDPOINT)throw new Error('RustFS должен быть только локальным контейнером');
 if(!['GET','HEAD','PUT','POST'].includes(method)
  ||!path.startsWith('/')||path.includes('..')||/[\r\n?#]/.test(path)
  ||typeof accessKey!=='string'||!accessKey||typeof secretKey!=='string'||!secretKey
  ||typeof body!=='string'||!Number.isFinite(now.getTime()))
  throw new Error('Неверный локальный запрос RustFS');
 const parsed=new URL(ENDPOINT);
 const amzDate=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const day=amzDate.slice(0,8),scope=day+'/us-east-1/s3/aws4_request';
 const queryEntries=Object.entries(query).sort(([a],[b])=>a.localeCompare(b,'en'))
  .map(([key,value])=>awsEncode(String(key))+'='+awsEncode(String(value)));
 const qs=queryEntries.join('&');
 const payloadSha=sha(body);
 const headers={
  host:parsed.host,'x-amz-content-sha256':payloadSha,'x-amz-date':amzDate,
 };
 const keys=Object.keys(headers).sort();
 const canonicalHeaders=keys.map(key=>key+':'+headers[key]+'\n').join('');
 const signedHeaders=keys.join(';');
 const canonicalRequest=[method,path,qs,canonicalHeaders,signedHeaders,payloadSha].join('\n');
 const stringToSign=['AWS4-HMAC-SHA256',amzDate,scope,sha(canonicalRequest)].join('\n');
 const key=hmac(hmac(hmac(hmac('AWS4'+secretKey,day),'us-east-1'),'s3'),'aws4_request');
 const signature=createHmac('sha256',key).update(stringToSign).digest('hex');
 return {
  url:ENDPOINT+path+(qs?'?'+qs:''),
  headers:{
   'x-amz-content-sha256':payloadSha,
   'x-amz-date':amzDate,
   Authorization:'AWS4-HMAC-SHA256 Credential='+accessKey+'/'+scope+
    ', SignedHeaders='+signedHeaders+', Signature='+signature,
  },
 };
}
function validateConfig(env,endpoint){
 if(endpoint!==ENDPOINT)throw new Error('RustFS должен работать только в локальной сети контейнеров');
 const names=['VENUE_S3_ROOT_ACCESS','VENUE_S3_ROOT_SECRET','VENUE_S3_APP_ACCESS','VENUE_S3_APP_SECRET'];
 if(names.some(key=>typeof env?.[key]!=='string'||env[key].length<12
  ||!(/^[a-zA-Z0-9_-]+$/.test(env[key]))))
  throw new Error('Нужны отдельные надёжные локальные ключи RustFS');
 if(env.VENUE_S3_APP_ACCESS===env.VENUE_S3_ROOT_ACCESS
  ||env.VENUE_S3_APP_SECRET===env.VENUE_S3_ROOT_SECRET)
  throw new Error('Root и приложение должны иметь разные ключи RustFS');
}
async function call(fetcher,opts,{method,path,query={},body='',accessKey,secretKey,timeoutMs=10000}){
 const request=signRustfsRequest({
  method,endpoint:opts.endpoint,path,query,body,accessKey,secretKey,now:opts.now,
 });
 const response=await fetcher(request.url,{
  method,
  headers:{...request.headers,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body}:{}),
  signal:AbortSignal.timeout(timeoutMs),
 });
 return response;
}
function safeNetworkFailure(error){
 const code=error?.cause?.code??error?.code;
 if(typeof code==='string'&&/^[A-Z0-9_]{2,48}$/.test(code))return 'NETWORK '+code;
 if(error?.name==='TimeoutError'||error?.name==='AbortError')return 'NETWORK TIMEOUT';
 return 'NETWORK UNAVAILABLE';
}
async function okResponse(response,context){
 if(response.ok)return;
 // Never echo the response: an error might contain a URL, credentials or PII.
 throw new Error('RustFS не подтвердил операцию: '+context+' (HTTP '+response.status+')');
}
// RustFS 1.0.4 may return an IAM document directly or wrapped/stringified.
// Never accept a pre-existing policy whose effective grants we cannot compare.
function canonicalPolicy(value){
 if(typeof value==='string'){
  try{return canonicalPolicy(JSON.parse(value))}catch{return null}
 }
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 if(value.Version==='2012-10-17'&&Array.isArray(value.Statement)){
  const stable=item=>Array.isArray(item)?item.map(stable):
   item&&typeof item==='object'?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):item;
  return JSON.stringify(stable(value));
 }
 for(const name of ['policy','Policy','policyInfo','policy_info','data']){
  if(Object.hasOwn(value,name)){
   const found=canonicalPolicy(value[name]);
   if(found)return found;
  }
 }
 return null;
}
async function readSafeJson(response){
 try{return JSON.parse(await response.text())}catch{return null}
}
function existingUserPolicy(user){
 const policy=user?.policyName??user?.policy_name??user?.policy??'';
 const status=String(user?.status??user?.accountStatus??'').toLowerCase();
 if(!['enabled','on','1'].includes(status))throw new Error('Existing RustFS user status not verified');
 if(typeof policy!=='string'||(policy&&policy!==POLICY_NAME)){
  throw new Error('Existing RustFS user has unexpected policy');
 }
 return policy;
}
export async function provisionVenueMedia(env,{
 fetcher=fetch,endpoint=ENDPOINT,now=new Date(),
 sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 startupTimeoutMs=180000,
}={}){
 validateConfig(env,endpoint);
 let phase='root-readiness';
 try{
 const opts={endpoint,now};
 const root={accessKey:env.VENUE_S3_ROOT_ACCESS,secretKey:env.VENUE_S3_ROOT_SECRET};
 const app={accessKey:env.VENUE_S3_APP_ACCESS,secretKey:env.VENUE_S3_APP_SECRET};
 // RustFS may need up to 120 seconds to initialize its single-node storage
 // on a cold Windows Docker Desktop volume. Wait for its documented readiness
 // endpoint before the first authenticated request or any IAM mutation.
 // Some older builds route /health/ready through S3 auth; 401/403/404 fall
 // back to a signed root probe, never treated as a successful readiness signal.
 let ready=false,lastFailure='NO_RESPONSE';
 const deadline=Date.now()+Math.max(0,startupTimeoutMs);
 while(!ready&&Date.now()<=deadline){
  try{
   const remaining=Math.max(1,deadline-Date.now());
   const probe=await fetcher(ENDPOINT+'/health/ready',{
    method:'GET',signal:AbortSignal.timeout(Math.min(5000,remaining)),
   });
   if(probe.status===200||[401,403,404].includes(probe.status)){
    const ping=await call(fetcher,opts,{
     method:'GET',path:'/',...root,timeoutMs:Math.min(5000,Math.max(1,deadline-Date.now())),
    });
    if(ping.ok){ready=true;break}
    if(ping.status===401||ping.status===403)
     throw new Error('Root credentials rejected (HTTP '+ping.status+')');
    lastFailure='HTTP '+ping.status;
   }else{
    lastFailure='HTTP '+probe.status;
   }
  }catch(error){
   if(error instanceof Error&&error.message.startsWith('Root credentials rejected'))throw error;
   lastFailure=safeNetworkFailure(error);
  }
  const waitMs=deadline-Date.now();
  if(waitMs<=0)break;
  await sleep(Math.min(1000,waitMs));
 }
 if(!ready)throw new Error('RustFS readiness timeout ('+lastFailure+')');
 // Existing IAM user/policy MUST NOT be changed, including after a partial
 // previous install: explicitly require operator recovery instead.
 phase='inspect-user';
 const user=await call(fetcher,opts,{
  method:'GET',path:'/rustfs/admin/v3/user-info',
  query:{accessKey:app.accessKey},...root,
 });
 if(![200,404].includes(user.status))throw new Error('IAM user probe failed (HTTP '+user.status+')');
 const currentUserPolicy=user.status===200?existingUserPolicy(await readSafeJson(user)):null;
 phase='inspect-policy';
 const policy=await call(fetcher,opts,{
  method:'GET',path:'/rustfs/admin/v3/info-canned-policy',
  query:{name:POLICY_NAME},...root,
 });
 if(![200,404].includes(policy.status))throw new Error('IAM policy probe failed (HTTP '+policy.status+')');
 if(policy.status===200&&canonicalPolicy(await readSafeJson(policy))!==canonicalPolicy(venueMediaPolicy())){
  throw new Error('Existing IAM policy is not the exact venue-only policy');
 }
 phase='inspect-bucket';
 const bucket=await call(fetcher,opts,{method:'HEAD',path:'/'+BUCKET,...root});
 if(![200,404].includes(bucket.status))throw new Error('Bucket probe failed (HTTP '+bucket.status+')');
 // Only create missing objects. An interrupted install may have saved 1-3
 // objects before the IAM association. Never replace a user, policy or bucket.
 if(bucket.status===404){
  phase='create-bucket';
  await okResponse(await call(fetcher,opts,{method:'PUT',path:'/'+BUCKET,...root}),'создание bucket');
 }
 if(policy.status===404){
  phase='create-policy';
  await okResponse(await call(fetcher,opts,{
   method:'PUT',path:'/rustfs/admin/v3/add-canned-policy',
   query:{name:POLICY_NAME},body:JSON.stringify(venueMediaPolicy()),...root,
  }),'создание ограниченной политики');
 }
 if(user.status===404){
  phase='create-user';
  await okResponse(await call(fetcher,opts,{
   method:'PUT',path:'/rustfs/admin/v3/add-user',query:{accessKey:app.accessKey},
   body:JSON.stringify({secretKey:app.secretKey,status:'enabled'}),...root,
  }),'создание сервисного пользователя');
 }
 if(currentUserPolicy!==POLICY_NAME){
  phase='attach-policy';
  await okResponse(await call(fetcher,opts,{
   method:'PUT',path:'/rustfs/admin/v3/set-user-or-group-policy',
   query:{policyName:POLICY_NAME,userOrGroup:app.accessKey,isGroup:'false'},...root,
  }),'назначение ограниченной политики');
 }
 phase='verify-bucket';
 const verify=await call(fetcher,opts,{method:'GET',path:'/'+BUCKET,...app});
 await okResponse(verify,'проверка доступа к bucket');
 // RustFS may return HTTP 200 for a filtered bucket listing. Check the
 // administrator boundary directly instead of treating a 200 on "/" as
 // proof of global bucket access.
 phase='verify-IAM-isolation';
 const adminProbe=await call(fetcher,opts,{
  method:'GET',path:'/rustfs/admin/v3/list-users',...app,
 });
 if(adminProbe.status!==403)
  throw new Error('Ограниченный RustFS пользователь может читать IAM: проверка не прошла');
 const listing=await call(fetcher,opts,{method:'GET',path:'/',...app});
 if(listing.ok){
  const body=await listing.text();
  const buckets=[...body.matchAll(/<Name>([^<]+)<\/Name>/g)].map(match=>match[1]);
  // A bucket owner name can appear as XML Name? Refuse explicitly foreign
  // buckets in the returned metadata; the only allowed name is USD venue.
  if(buckets.some(name=>name!==BUCKET))
   throw new Error('RustFS показывает посторонние buckets');
 }else if(listing.status!==403){
  throw new Error('RustFS не подтвердил ограничения на перечисление buckets');
 }
 return {bucket:BUCKET,restricted:true};
 }catch(error){
  // Exact safe operation and HTTP status, never raw HTTP bodies, URLs or keys.
  const code=error instanceof Error?error.message.match(/HTTP [1-5][0-9]{2}|NETWORK [A-Z0-9_]+/)?.[0]:null;
  throw new Error('USD VENUE MEDIA FAILED AT '+phase+(code?' ['+code+']':''));
 }
}
async function main(){
 // This CLI must not be copied to public Ubuntu or invoked outside LAN mode.
 if(process.env.USD_VENUE_LAN_MODE!=='true'
  ||!process.env.VENUE_STAGE_ID?.match(/^[0-9a-f-]{36}$/i))
  throw new Error('Провижининг только изолированного этапа');
 // The running API receives *only* scoped S3_ACCESS_KEY_ID/SECRET.
 // Root credentials are added to this disposable CLI container via -e.
 const env={
  ...process.env,
  VENUE_S3_APP_ACCESS:process.env.S3_ACCESS_KEY_ID,
  VENUE_S3_APP_SECRET:process.env.S3_SECRET_ACCESS_KEY,
 };
 const result=await provisionVenueMedia(env);
 process.stdout.write('USD VENUE MEDIA READY — BUCKET '+result.bucket+'; scoped IAM verified\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{
  console.error('USD VENUE MEDIA BLOCKED: check private Docker network, empty bucket and fresh restricted credentials');
  if(process.env.USD_VENUE_CI_DIAG==='true'||process.env.USD_VENUE_INSTALL_DIAG==='true'){
   const message=error instanceof Error?error.message:'Unknown';
   let safe=message;
   for(const value of [process.env.VENUE_S3_ROOT_SECRET,process.env.VENUE_S3_APP_SECRET]){
    if(value)safe=safe.replaceAll(value,'[REDACTED]');
   }
   console.error('USD VENUE MEDIA INSTALL DIAG: '+safe);
  }
  process.exitCode=1;
 });
}
