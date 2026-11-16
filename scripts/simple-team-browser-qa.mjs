import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const out=path.resolve(process.env.USD_SIMPLE_TEAM_QA_OUTPUT??'simple-team-browser-qa');await mkdir(out,{recursive:true});
const dist=path.join(root,'frontend/dist'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(dist,'.'+p);if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return}let b,ext=path.extname(file);try{b=await readFile(file)}catch{b=await readFile(path.join(dist,'index.html'));ext='.html'}res.writeHead(200,{'Content-Type':mime[ext]??'application/octet-stream'}).end(b)}catch{res.writeHead(500).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(getBrowserLaunchOptions()),report=[];
try{for(const width of [320,390,1440]){
 let fullManagement=false,selectedTeam=null,selectionWrites=0,failSave=false;
 const errors=[];
 const team={id:'t1',name:'Fixture Team',description:'Team description',isActive:true,commanderUserId:'commander',memberships:[],members:[],historicalMembers:[],posts:[{id:'post1',kind:'NEWS',title:'Saved team news',body:'Saved publication',status:'PUBLISHED'}]};
 const open=async actor=>{const ctx=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});await ctx.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin===base)return route.continue();let data=[];const body=['PATCH','POST'].includes(req.method())?req.postDataJSON():null;
  if(u.pathname==='/auth/refresh')data={accessToken:'synthetic',user:{id:'u1',role:actor==='admin'?'ADMIN':'PARTICIPANT',email:'fixture@example.test',participantId:'p1'}};
  else if(u.pathname==='/site-settings/public')data={settings:{branding:{siteName:'USD'},homepage:{blocks:[]},catalogs:{},legal:{}}};
  else if(u.pathname==='/participants/me')data={participant:{id:'p1',firstName:'Fixture',lastName:'Member'}};
  else if(u.pathname==='/teams/mode'){if(req.method()==='PATCH')fullManagement=body.fullManagement;data={fullManagement}}
  else if(u.pathname==='/teams/admin')data={fullManagement,teams:[team],users:[]};
  else if(u.pathname==='/teams/public')data=[team];
  else if(u.pathname==='/teams/options')data=[{name:team.name}];
  else if(u.pathname==='/teams/me/selection'){
   if(req.method()==='PATCH'){if(failSave){failSave=false;return route.fulfill({status:409,json:{message:'Synthetic save failure'}})}selectedTeam=body.name||null;selectionWrites++}
   data={team:selectedTeam};
  }
  else if(u.pathname==='/teams/me')data={membership:null,commandedTeam:team};
  else if(u.pathname.includes('achievements'))data={teamId:'t1',teamName:team.name,scope:'FIRST_PASSED_INSPECTION',stages:[],total:0,summary:{participants:0,podiums:0,firstPlaces:0,directions:[]}};
  else if(u.pathname.includes('historical-final-configuration'))data={required:false};
  else if(u.pathname==='/auth/legal-consent')data={legalReady:false};
  else if(u.pathname==='/auth/newsletter-consent')data={consent:false};
  return route.fulfill({json:data});
 });const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return {ctx,page}};
 const capture=async(page,name)=>{const cookie=page.getByRole('button',{name:'Только необходимые',exact:true});if(await cookie.isVisible())await cookie.click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' has no page overflow');await page.screenshot({path:path.join(out,name+'-'+width+'.png')})};
 const member=await open('member'),admin=await open('admin');try{
  const p=member.page;await p.goto(base+'/participant?tab=team&teamId=t1');await p.getByLabel('Команда',{exact:true}).waitFor();
  assert.equal(await p.getByLabel('Команда',{exact:true}).inputValue(),team.name);assert.equal(selectionWrites,0,'shared team link never auto-saves');
  assert.equal(await p.locator('.team-workspace').count(),0);assert.equal(await p.getByRole('button',{name:'Подать заявку',exact:true}).count(),0);
  failSave=true;await p.getByRole('button',{name:'Сохранить команду',exact:true}).click();await p.getByRole('alert').waitFor();assert.equal(selectedTeam,null);assert.equal(await p.getByLabel('Команда',{exact:true}).inputValue(),team.name);
  await p.getByRole('button',{name:'Сохранить команду',exact:true}).click();await p.getByText('Команда сохранена',{exact:true}).waitFor();assert.equal(selectedTeam,team.name);assert.equal(selectionWrites,1);await capture(p,'member-selected');
  await p.reload();await p.getByLabel('Команда',{exact:true}).waitFor();assert.equal(await p.getByLabel('Команда',{exact:true}).inputValue(),team.name);
  await p.getByLabel('Команда',{exact:true}).selectOption('');await p.getByRole('button',{name:'Сохранить команду',exact:true}).click();await p.getByText('Команда сохранена',{exact:true}).waitFor();assert.equal(selectedTeam,null);
  await p.goto(base+'/teams/Fixture%20Team');await p.getByRole('link',{name:'Выбрать команду',exact:true}).waitFor();assert.equal(await p.getByText('Saved team news',{exact:true}).count(),0);assert.equal(await p.getByRole('heading',{name:'Текущий состав',exact:true}).count(),0);await capture(p,'public-simple');
  const a=admin.page;await a.goto(base+'/admin/teams');await a.getByLabel('Полное управление командами',{exact:true}).waitFor();assert.equal(await a.getByLabel('Полное управление командами',{exact:true}).isChecked(),false);
  await a.locator('.team-team-list li button').first().click();await a.getByRole('button',{name:'Убрать из списка выбора',exact:true}).waitFor();assert.equal(await a.locator('.team-workspace').count(),0);assert.equal(await a.locator('.team-review-queue').count(),0);await capture(a,'admin-simple');
  await a.getByLabel('Полное управление командами',{exact:true}).check();await a.locator('.team-workspace').waitFor();assert.equal(fullManagement,true);await a.locator('.team-workspace').getByRole('button',{name:'Новости и достижения',exact:true}).click();await a.getByText('Saved team news',{exact:true}).waitFor();await capture(a,'admin-full-restored');
  await a.getByLabel('Полное управление командами',{exact:true}).uncheck();await a.getByRole('button',{name:'Убрать из списка выбора',exact:true}).waitFor();assert.equal(await a.locator('.team-workspace').count(),0);assert.equal(fullManagement,false);
 }finally{await member.ctx.close();await admin.ctx.close()}
 assert.deepEqual(errors,[]);report.push({width,status:'passed',scenarios:'explicit selection, failed save retry, reload, no team, hidden news and commander, ADMIN full-mode restore and disable',overflow:false});
}}finally{await browser.close();await new Promise(r=>server.close(r));await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2))}
console.log(JSON.stringify(report,null,2));
