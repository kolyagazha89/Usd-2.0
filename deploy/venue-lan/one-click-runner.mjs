#!/usr/bin/env node
/** Disposable USD Windows LAN demo. NEVER accesses central API or syncs. */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {writeVenueDemo} from './make-demo-stage.mjs';
import {verifyVenueStageHandoff} from './verify-stage-package.mjs';
import {planVenueStageImport} from './import-stage.mjs';
import {
 assertVenueIp,assertFreshDemoInstall,makeDemoEnv,scopedMediaPolicy,signedRustfsRequest,
} from './one-click-core.mjs';

const ROOT=dirname(fileURLToPath(import.meta.url));
const ENV=join(ROOT,'.env'),DEMO=join(ROOT,'.venue-oneclick-demo'),READY=join(DEMO,'.ready');
const COMPOSE=join(ROOT,'compose.yaml');
const SHA=/^[a-f0-9]{40}$/;
const composeBase=['compose','-p','usd-venue','-f',COMPOSE,'--env-file',ENV];
const strongPassword=()=> 'Venue-'+randomBytes(20).toString('hex')+'!A7';
const wait=ms=>new Promise(done=>setTimeout(done,ms));

export function safeCommand(args){
 if(!Array.isArray(args)||args.some(v=>typeof v!=='string'||v.includes('\0')))
  throw new Error('Некорректная команда');
 return args;
}
function execute(command,args,{input,quiet=false}={}){
 safeCommand(args);
 const result=spawnSync(command,args,{
  cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024,
  input,windowsHide:true,timeout:10*60*1000,
 });
 if(result.error||result.status!==0){
  // Never log docker compose/config output; it can contain database secrets.
  throw new Error('Команда '+command+' завершилась ошибкой ('
   +(result.status===null?'не запустилась':'код '+result.status)+'). Проверьте Docker Desktop.');
 }
 if(!quiet&&result.stdout?.trim())console.log(result.stdout.trim().slice(-3000));
 return result.stdout??'';
}
function docker(args,options={}){return execute('docker',args,options)}
function compose(args,options={}){return docker([...composeBase,...args],options)}
function checkDocker(){
 docker(['info','--format','{{.ServerVersion}}'],{quiet:true});
 compose(['version'],{quiet:true});
}
function assertNoOldVenue(){
 const names=docker(['volume','ls','--format','{{.Name}}'],{quiet:true}).split(/\r?\n/);
 const containers=docker(['ps','-a','--filter',
  'label=com.docker.compose.project=usd-venue','--format','{{.ID}}'],{quiet:true});
 assertFreshDemoInstall({
  envExists:existsSync(ENV),demoExists:existsSync(DEMO),
  volumeNames:names,containerIds:containers,
 });
}
function fromEnv(content){
 const settings={};
 for(const line of content.split(/\r?\n/)){
  if(!line.trim()||line.trimStart().startsWith('#'))continue;
  const at=line.indexOf('=');
  if(at<1)throw new Error('Повреждён локальный .env');
  const key=line.slice(0,at);
  if(!/^[A-Z][A-Z0-9_]*$/.test(key)||Object.hasOwn(settings,key))
   throw new Error('Некорректные настройки');
  settings[key]=line.slice(at+1);
 }
 return settings;
}
async function loadSettings(){
 if(!existsSync(ENV)||!existsSync(READY))
  throw new Error('Установка не завершена. Не удаляйте данные и не повторяйте импорт поверх базы.');
 const env=fromEnv(await readFile(ENV,'utf8'));
 assertVenueIp(env.VENUE_BIND_IP);
 if(!SHA.test(env.VENUE_IMAGE_TAG??'')||!env.VENUE_STAGE_ID||!env.VENUE_SIGNING_KEY_FINGERPRINT)
  throw new Error('Повреждена конфигурация локального сервера');
 const pkg=JSON.parse(await readFile(join(DEMO,'usd-venue-demo-stage.json'),'utf8'));
 if(pkg.snapshot.stageId!==env.VENUE_STAGE_ID||pkg.snapshot.stage.rulesSnapshot?.demo!==true)
  throw new Error('Автоматическое управление разрешено только для тестового этапа');
 return env;
}
async function requestRustfs(env,method,path,body='',query=''){
 const {url,...init}=signedRustfsRequest({
  method,path,body,query,accessKey:env.VENUE_S3_ROOT_ACCESS,
  secretKey:env.VENUE_S3_ROOT_SECRET,
 });
 return fetch(url,{...init,signal:AbortSignal.timeout(7000)});
}
export async function setupRustfs(env){
 console.log('Настраиваю ограниченный bucket для медиа...');
 let bucketReady=false;
 for(let i=0;i<40;i++){
  try{
   const resp=await requestRustfs(env,'PUT','/usd-venue-media');
   if([200,201,204].includes(resp.status)){bucketReady=true;break}
   if(resp.status===409)throw new Error('Bucket уже существует: отказ от перезаписи');
   if(![502,503].includes(resp.status))
    throw new Error('RustFS не разрешил создать bucket');
  }catch(error){
   if(error instanceof Error&&/bucket|RustFS/.test(error.message))throw error;
  }
  await wait(1000);
 }
 if(!bucketReady)throw new Error('RustFS не вышел в готовность');
 const response=await requestRustfs(env,'PUT','/rustfs/admin/v3/add-service-account',{
  accessKey:env.VENUE_S3_APP_ACCESS,secretKey:env.VENUE_S3_APP_SECRET,
  name:'usd-venue-media-only',policy:scopedMediaPolicy(),
 });
 if(!response.ok)throw new Error('RustFS отказал в ограниченной медиа-учётной записи');
 const list=signedRustfsRequest({
  method:'GET',path:'/usd-venue-media',query:'list-type=2',
  accessKey:env.VENUE_S3_APP_ACCESS,secretKey:env.VENUE_S3_APP_SECRET,
 });
 const listResponse=await fetch(list.url,{
  method:list.method,headers:list.headers,signal:AbortSignal.timeout(7000),
 });
 if(!listResponse.ok)throw new Error('Сервисный ключ не может просматривать свой bucket');
 const admin=signedRustfsRequest({
  method:'GET',path:'/rustfs/admin/v3/list-users',
  accessKey:env.VENUE_S3_APP_ACCESS,secretKey:env.VENUE_S3_APP_SECRET,
 });
 const denied=await fetch(admin.url,{
  method:admin.method,headers:admin.headers,signal:AbortSignal.timeout(7000),
 });
 if(denied.status!==403)throw new Error('Сервисный ключ не получил явный отказ в администрировании RustFS');
}
function mount(file,target){
 if(!existsSync(file))throw new Error('Обязательный файл площадки отсутствует');
 return ['--volume',resolve(file)+':'+target+':ro'];
}
const imports=()=>[
 ...mount(join(ROOT,'import-stage.mjs'),'/app/import-stage.mjs'),
 ...mount(join(ROOT,'verify-stage-package.mjs'),'/app/verify-stage-package.mjs'),
];
const packageMounts=()=>[
 ...imports(),
 ...mount(join(DEMO,'usd-venue-demo-stage.json'),'/app/venue-stage.json'),
 ...mount(join(DEMO,'signing-public.pem'),'/app/venue-signing-public.pem'),
];
function provision(kind,name,password){
 compose(['run','--rm','--no-deps','-T',
  ...mount(join(ROOT,'provision-staff.mjs'),'/app/provision-staff.mjs'),
  ...imports(),'--entrypoint','node','api',
  '/app/provision-staff.mjs',kind,name],{input:password,quiet:true});
}
async function checkApiReadiness(){
 const source="fetch('http://127.0.0.1:3000/results/venue-live').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))";
 for(let i=0;i<35;i++){
  try{compose(['exec','-T','api','node','-e',source],{quiet:true});return}
  catch{await wait(2000)}
 }
 throw new Error('API не запустился. Проверьте docker compose logs api (без отправки секретов).');
}
export async function installDemo(ip){
 assertVenueIp(ip);
 checkDocker();
 assertNoOldVenue();
 console.log('Создаю отдельный синтетический этап. Настоящие данные не копируются.');
 const {stageId,fingerprint}=await writeVenueDemo(DEMO);
 const {settings,content}=makeDemoEnv({ip,stageId,fingerprint});
 await writeFile(ENV,content,{flag:'wx',mode:0o600});
 if(process.platform!=='win32')await chmod(ENV,0o600);
 const pkg=JSON.parse(await readFile(join(DEMO,'usd-venue-demo-stage.json'),'utf8'));
 const publicPem=await readFile(join(DEMO,'signing-public.pem'),'utf8');
 verifyVenueStageHandoff(pkg,publicPem);
 planVenueStageImport(pkg,publicPem,{
  ...settings,DATABASE_URL:settings.VENUE_DATABASE_URL,USD_VENUE_LAN_MODE:'true',
 });
 compose(['config','--quiet'],{quiet:true});
 console.log('Загружаю закреплённые Docker-образы: нужен интернет только при подготовке.');
 compose(['pull'],{quiet:true});
 compose(['up','-d','db','rustfs'],{quiet:true});
 await setupRustfs(settings);
 compose(['run','--rm','--no-deps','-T','--entrypoint',
  './node_modules/.bin/prisma','api','migrate','deploy','--config',
  './prisma7.config.ts'],{quiet:true});
 compose(['run','--rm','--no-deps','-T',...packageMounts(),
  '--entrypoint','node','api','/app/import-stage.mjs',
  '/app/venue-stage.json','/app/venue-signing-public.pem','--apply',stageId],{quiet:true});
 const sql=await readFile(join(ROOT,'install-journal.sql'),'utf8');
 compose(['exec','-T','db','psql','-v','ON_ERROR_STOP=1',
  '-U','usd_venue_root','-d','usd_venue'],{input:sql,quiet:true});
 const adminPassword=strongPassword(),judgePassword=strongPassword();
 provision('admin','operator1',adminPassword);
 provision('judge','judge-01',judgePassword);
 compose(['up','-d'],{quiet:true});
 await checkApiReadiness();
 await writeFile(READY,'DEMO ONLY\n'+stageId+'\n',{flag:'wx',mode:0o600});
 console.log('ДЕМО-СЕРВЕР УСТАНОВЛЕН. Запишите одноразово показанные пароли:');
 console.log('АДМИН: operator1@venue.invalid ПАРОЛЬ: '+adminPassword);
 console.log('СУДЬЯ: judge-01@venue.invalid ПАРОЛЬ: '+judgePassword);
 console.log('Пароли второй раз не показываются. HTTPS: https://'+ip+'/venue/live');
 console.log('На каждом телефоне отдельно подтвердите доверие локальному CA Caddy.');
 return ip;
}
export async function startDemo(){
 const env=await loadSettings();
 checkDocker();
 compose(['up','-d'],{quiet:true});
 await checkApiReadiness();
 console.log('Локальный USD запущен: https://'+env.VENUE_BIND_IP+'/venue/live');
 return env.VENUE_BIND_IP;
}
export async function stopDemo(){
 await loadSettings();
 checkDocker();
 compose(['stop'],{quiet:true}); // NEVER down -v, cleanup, or sync.
 console.log('Локальный USD остановлен; данные сохранены.');
 console.log('ВНИМАНИЕ: данные площадки НЕ переданы на основной сервер!');
 return 'https://app.usd-russia.ru';
}
async function main(){
 const [command,...args]=process.argv.slice(2);
 if(command==='install-demo'&&args.length===1)await installDemo(args[0]);
 else if(command==='start'&&args.length===0)await startDemo();
 else if(command==='stop'&&args.length===0)await stopDemo();
 else throw Error('Usage: node one-click-runner.mjs install-demo LAN_IP | start | stop');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{
  console.error('USD DEMO: '+(error instanceof Error?error.message:'Операция отклонена'));
  console.error('Данные не удалялись. НЕ запускайте docker compose down -v.');
  process.exitCode=1;
 });
}
