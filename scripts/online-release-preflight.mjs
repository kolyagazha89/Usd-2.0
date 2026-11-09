import {pathToFileURL} from 'node:url';

/**
 * Read-only exact-SHA release check for the online USD prerelease host.
 * No credentials, no cookies, no writes, no redirect follows, no participant
 * names or email addresses in the report. Not an authenticated E2E test.
 */
const FRONT='https://app.usd-russia.ru';
const API='https://api.usd-russia.ru';
const MAX_JSON_BYTES=2*1024*1024;
const shaPattern=/^[0-9a-f]{40}$/;

async function boundedJson(response){
 const type=response.headers?.get('content-type')??'';
 if(!type.toLowerCase().includes('application/json'))throw new Error('Not JSON');
 const declared=Number(response.headers.get('content-length')??'0');
 if(!Number.isFinite(declared)||declared>MAX_JSON_BYTES||declared<0)throw new Error('Response too large');
 if(!response.body)throw new Error('Empty response');
 const reader=response.body.getReader(),parts=[];
 let length=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   length+=value.byteLength;
   if(length>MAX_JSON_BYTES)throw new Error('Response too large');
   parts.push(value);
  }
 }finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(length);let offset=0;
 for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 return JSON.parse(new TextDecoder().decode(bytes));
}

async function hasBody(response){
 const type=(response.headers?.get('content-type')??'').toLowerCase();
 if(!type.startsWith('image/'))throw new Error('Not an image');
 const reader=response.body?.getReader();
 if(!reader)throw new Error('Empty media');
 try{
  const first=await reader.read();
  if(first.done||!first.value?.byteLength||first.value.byteLength>MAX_JSON_BYTES)
   throw new Error('Empty or oversized media chunk');
 }finally{await reader.cancel().catch(()=>{});}
}

const textOf=(value)=>typeof value==='string'?value.trim():'';
const safeId=(value)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i.test(value);
const asList=(value)=>Array.isArray(value)?value:null;
const asRecord=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;

export async function inspectOnlineRelease({expectedSha,request=globalThis.fetch,timeoutMs=10000}={}){
 if(typeof expectedSha!=='string'||!shaPattern.test(expectedSha))
  throw new Error('Expected SHA must be exactly 40 lowercase hexadecimal characters');
 const checks=[],revisions={frontend:null,api:null};
 async function check(name,url,accept){
  try{
   const response=await request(url,{
    method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',
    headers:{Accept:'application/json, image/*'},signal:AbortSignal.timeout(timeoutMs),
   });
   if(response.status>=300&&response.status<400)throw new Error('Redirect rejected');
   await accept(response);
   checks.push({name,ok:true});
  }catch(error){
   // Never put fetch errors or remote response bodies into release logs.
   checks.push({name,ok:false,reason:error instanceof Error &&
    ['Redirect rejected','Not JSON','Response too large','Empty response','Not an image',
     'Empty media','Empty or oversized media chunk'].includes(error.message)
    ?error.message:'Read or contract failed'});
  }
 }
 async function json(name,url,validate,{allowEmpty=true}={}){
  let payload=null;
  await check(name,url,async response=>{
   if(response.status!==200)throw new Error('Unexpected HTTP status');
   payload=await boundedJson(response);
   if(!validate(payload))throw new Error('Invalid data shape');
   if(!allowEmpty&&Array.isArray(payload)&&payload.length<1)throw new Error('Empty');
  });
  return payload;
 }
 const front=await json('frontend-revision',FRONT+'/usd-release.json',
  p=>Boolean(asRecord(p)&&shaPattern.test(textOf(p.revision))&&p.revision===expectedSha));
 if(front)revisions.frontend=front.revision;
 const api=await json('api-revision',API+'/release',
  p=>Boolean(asRecord(p)&&shaPattern.test(textOf(p.revision))&&p.revision===expectedSha));
 if(api)revisions.api=api.revision;
 const seasons=await json('public-seasons',API+'/seasons',p=>Boolean(asList(p)&&p.every(x=>asRecord(x)&&safeId(x.id))),{allowEmpty:false});
 const stages=await json('public-stages',API+'/stages/public',p=>Boolean(asList(p)&&p.every(x=>asRecord(x)&&safeId(x.id))),{allowEmpty:false});
 await json('public-directions',API+'/directions',p=>Boolean(asList(p)),{allowEmpty:false});
 await json('public-records',API+'/records/current',p=>Boolean(asList(p)));
 await json('public-teams',API+'/teams/public',p=>Boolean(asList(p)));
 await json('public-settings',API+'/site-settings/public',p=>Boolean(asRecord(p)&&asRecord(p.settings)));
 const seasonId=seasons?.[0]?.id;
 if(safeId(seasonId)){
  await json('team-standings',API+'/teams/public/standings?seasonId='+encodeURIComponent(seasonId),
   p=>Boolean(asRecord(p)&&asRecord(p.scope)&&Array.isArray(p.teams)));
 }else checks.push({name:'team-standings',ok:false,reason:'No valid season'});
 const stageId=stages?.[0]?.id;
 if(safeId(stageId)){
  await check('stage-poster',API+'/media/public-file/SITE_ASSET/stage-poster-'+stageId,async response=>{
   if(response.status!==200)throw new Error('Media read failed');
   await hasBody(response);
  });
 }else checks.push({name:'stage-poster',ok:false,reason:'No valid stage'});
 await check('admin-access-control',API+'/statistics/overview',async response=>{
  if(response.status!==401&&response.status!==403)throw new Error('ADMIN data readable anonymously');
 });
 return {ok:checks.every(x=>x.ok),expectedSha,revisions,checks};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const expectedSha=process.argv[2]??'';
 try{
  const report=await inspectOnlineRelease({expectedSha});
  console.log(JSON.stringify(report,null,2));
  if(!report.ok)process.exitCode=1;
 }catch(error){
  console.error('Usage: node scripts/online-release-preflight.mjs <exact-40-char-main-SHA>');
  process.exitCode=2;
 }
}
