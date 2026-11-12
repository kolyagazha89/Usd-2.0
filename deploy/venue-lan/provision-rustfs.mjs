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
async function call(fetcher,opts,{method,path,query={},body='',accessKey,secretKey}){
 const request=signRustfsRequest({
  method,endpoint:opts.endpoint,path,query,body,accessKey,secretKey,now:opts.now,
 });
 const response=await fetcher(request.url,{
  method,
  headers:{...request.headers,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body}:{}),
  signal:AbortSignal.timeout(10000),
 });
 return response;
}
async function okResponse(response,context){
 if(response.ok)return;
 // Never echo the response: an error might contain a URL, credentials or PII.
 throw new Error('RustFS не подтвердил операцию: '+context+' (HTTP '+response.status+')');
}
export async function provisionVenueMedia(env,{
 fetcher=fetch,endpoint=ENDPOINT,now=new Date(),
}={}){
 validateConfig(env,endpoint);
 const opts={endpoint,now};
 const root={accessKey:env.VENUE_S3_ROOT_ACCESS,secretKey:env.VENUE_S3_ROOT_SECRET};
 const app={accessKey:env.VENUE_S3_APP_ACCESS,secretKey:env.VENUE_S3_APP_SECRET};
 // Wait only for a READ-ONLY, authenticated readiness response. Never retry
 // after the first write: a partial IAM creation needs operator review.
 let ready=false;
 for(let i=0;i<30;i++){
  try{
   const ping=await call(fetcher,opts,{method:'GET',path:'/',...root});
   if(ping.ok){ready=true;break}
  }catch{}
  if(i<29)await new Promise(resolve=>setTimeout(resolve,1000));
 }
 if(!ready)throw new Error('Локальный RustFS недоступен');
 // Existing IAM user/policy MUST NOT be changed, including after a partial
 // previous install: explicitly require operator recovery instead.
 const user=await call(fetcher,opts,{
  method:'GET',path:'/rustfs/admin/v3/user-info',
  query:{accessKey:app.accessKey},...root,
 });
 if(user.status!==404)throw new Error('Сервисный пользователь RustFS уже существует или не проверен (HTTP '+user.status+')');
 const policy=await call(fetcher,opts,{
  method:'GET',path:'/rustfs/admin/v3/info-canned-policy',
  query:{name:POLICY_NAME},...root,
 });
 if(policy.status!==404)throw new Error('Политика RustFS уже существует или не проверена (HTTP '+policy.status+')');
 const bucket=await call(fetcher,opts,{method:'HEAD',path:'/'+BUCKET,...root});
 if(bucket.status!==404)throw new Error('Bucket RustFS уже существует или не проверен (HTTP '+bucket.status+')');

 await okResponse(await call(fetcher,opts,{method:'PUT',path:'/'+BUCKET,...root}),'создание bucket');
 await okResponse(await call(fetcher,opts,{
  method:'PUT',path:'/rustfs/admin/v3/add-canned-policy',
  query:{name:POLICY_NAME},body:JSON.stringify(venueMediaPolicy()),...root,
 }),'создание ограниченной политики');
 await okResponse(await call(fetcher,opts,{
  method:'PUT',path:'/rustfs/admin/v3/add-user',query:{accessKey:app.accessKey},
  body:JSON.stringify({secretKey:app.secretKey,status:'enabled'}),...root,
 }),'создание сервисного пользователя');
 await okResponse(await call(fetcher,opts,{
  method:'PUT',path:'/rustfs/admin/v3/set-user-or-group-policy',
  query:{policyName:POLICY_NAME,userOrGroup:app.accessKey,isGroup:'false'},...root,
 }),'назначение ограниченной политики');
 const verify=await call(fetcher,opts,{method:'GET',path:'/'+BUCKET,...app});
 await okResponse(verify,'проверка доступа к bucket');
 const escape=await call(fetcher,opts,{method:'GET',path:'/',...app});
 if(escape.status!==403)
  throw new Error('Ограниченная роль RustFS может обращаться к чужим bucket: проверка не прошла');
 return {bucket:BUCKET,restricted:true};
}
async function main(){
 // This CLI must not be copied to public Ubuntu or invoked outside LAN mode.
 if(process.env.USD_VENUE_LAN_MODE!=='true'
  ||!process.env.VENUE_STAGE_ID?.match(/^[0-9a-f-]{36}$/i))
  throw new Error('Провижининг только изолированного этапа');
 const result=await provisionVenueMedia(process.env);
 process.stdout.write('USD VENUE MEDIA READY — BUCKET '+result.bucket+'; scoped IAM verified\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{
  console.error('USD VENUE MEDIA BLOCKED: check private Docker network, empty bucket and fresh restricted credentials');
  if(process.env.USD_VENUE_CI_DIAG==='true'){
   const message=error instanceof Error?error.message:'Unknown';
   let safe=message;
   for(const value of [process.env.VENUE_S3_ROOT_SECRET,process.env.VENUE_S3_APP_SECRET]){
    if(value)safe=safe.replaceAll(value,'[REDACTED]');
   }
   console.error('USD VENUE MEDIA CI DIAG: '+safe);
  }
  process.exitCode=1;
 });
}
