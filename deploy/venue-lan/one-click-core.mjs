/** Pure guards and signed requests for the disposable Windows LAN demo.
 * No production credentials, never selects a public/WAN listener.
 */
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {isIP} from 'node:net';

const PINNED_RELEASE='ee5ec0671367db472ff7e179dde770025a246b6c';
const sha=value=>createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
const secret=(bytes=32)=>randomBytes(bytes).toString('hex');

export function assertVenueIp(value){
 if(isIP(value)!==4)throw new Error('Нужен IPv4 ноутбука в локальной сети роутера');
 const a=value.split('.').map(Number);
 if(!(a[0]===10||a[0]===172&&a[1]>=16&&a[1]<=31
  ||a[0]===192&&a[1]===168))throw new Error('IP должен относиться к частной сети LAN');
 if(a[3]===0||a[3]===255)throw new Error('Не используйте адрес сети или broadcast');
 return value;
}
export function makeDemoEnv({ip,stageId,fingerprint,imageTag=PINNED_RELEASE}){
 assertVenueIp(ip);
 if(!/^[0-9a-f-]{36}$/i.test(stageId)||!/^[0-9a-f]{64}$/.test(fingerprint))
  throw new Error('Неверная подпись или UUID тестового этапа');
 if(!/^[0-9a-f]{40}$/.test(imageTag))throw new Error('Используйте закреплённый SHA релиза');
 const root=secret(),db=secret(),app=secret();
 const settings={
  VENUE_BIND_IP:ip,VENUE_IMAGE_TAG:imageTag,VENUE_STAGE_ID:stageId,
  VENUE_SIGNING_KEY_FINGERPRINT:fingerprint,
  VENUE_DB_NAME:'usd_venue',VENUE_DB_ROOT_USER:'usd_venue_root',
  VENUE_DB_ROOT_PASSWORD:root,VENUE_DB_USER:'usd_venue',VENUE_DB_PASSWORD:db,
  VENUE_DATABASE_URL:'postgresql://usd_venue:'+encodeURIComponent(db)+'@db:5432/usd_venue?schema=public',
  VENUE_JWT_SECRET:secret(48),
  VENUE_S3_ROOT_ACCESS:'usdroot'+randomBytes(6).toString('hex'),VENUE_S3_ROOT_SECRET:secret(32),
  VENUE_S3_APP_ACCESS:'usdapp'+randomBytes(7).toString('hex'),VENUE_S3_APP_SECRET:app,
 };
 return {settings,content:Object.entries(settings).map(([k,v])=>k+'='+v).join('\n')+'\n'};
}
export function scopedMediaPolicy(){
 return {Version:'2012-10-17',Statement:[
  {Effect:'Allow',Action:['s3:GetBucketLocation','s3:ListBucket'],Resource:['arn:aws:s3:::usd-venue-media']},
  {Effect:'Allow',Action:['s3:GetObject','s3:PutObject','s3:DeleteObject'],Resource:['arn:aws:s3:::usd-venue-media/*']},
 ]};
}
const canonicalPath=path=>path.split('/').map(encodeURIComponent).join('/').replaceAll('%2F','/');
const amzDate=date=>date.toISOString().replace(/[:-]|\.\d{3}/g,'');
/** AWS SigV4 used by RustFS S3 and admin API, strictly laptop-local. */
export function signedRustfsRequest({method,path,body='',accessKey,secretKey,date=new Date(),query=''}){
 if(!/^[A-Za-z0-9/_-]+$/.test(path)||!path.startsWith('/')||path.includes('//')
  ||!['GET','PUT','HEAD'].includes(method)||!accessKey||!secretKey)
  throw new Error('Неверный локальный запрос RustFS');
 const day=amzDate(date).slice(0,8),stamp=amzDate(date);
 const url='http://127.0.0.1:19000'+path+(query?'?'+query:'');
 const payload=typeof body==='string'?body:JSON.stringify(body);
 const payloadHash=sha(payload);
 const headers={host:'127.0.0.1:19000','x-amz-content-sha256':payloadHash,'x-amz-date':stamp};
 if(method==='PUT'&&body!=='')headers['content-type']='application/json';
 const keys=Object.keys(headers).sort();
 const signedHeaders=keys.join(';');
 const canonicalHeaders=keys.map(k=>k+':'+headers[k].trim()+'\n').join('');
 const canonical=[method,canonicalPath(path),query,canonicalHeaders,signedHeaders,payloadHash].join('\n');
 const scope=day+'/us-east-1/s3/aws4_request';
 const stringToSign=['AWS4-HMAC-SHA256',stamp,scope,sha(canonical)].join('\n');
 const signingKey=hmac(hmac(hmac(hmac('AWS4'+secretKey,day),'us-east-1'),'s3'),'aws4_request');
 const signature=hmac(signingKey,stringToSign).toString('hex');
 headers.authorization='AWS4-HMAC-SHA256 Credential='+accessKey+'/'+scope
  +', SignedHeaders='+signedHeaders+', Signature='+signature;
 return {url,method,headers,body:method==='HEAD'||method==='GET'?undefined:payload};
}
/** Guard against replacing event volumes or an interrupted prior install. */
export function assertFreshDemoInstall({envExists,demoExists,volumeNames,containerIds}){
 if(envExists||demoExists)throw new Error('Конфигурация уже существует: нельзя перезаписывать локальные результаты');
 if(!Array.isArray(volumeNames)||typeof containerIds!=='string')throw new Error('Не удалось проверить изоляцию Docker');
 if(volumeNames.some(name=>name.startsWith('usd-venue_'))||containerIds.trim())
  throw new Error('Локальная база или контейнеры уже существуют — установка DEMO запрещена');
}
