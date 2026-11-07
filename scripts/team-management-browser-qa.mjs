import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const out=path.resolve(process.env.USD_TEAM_MANAGEMENT_QA_OUTPUT??'team-management-browser-qa');await mkdir(out,{recursive:true});
const dist=path.join(root,'frontend/dist'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(dist,'.'+p);if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return}let b,ext=path.extname(file);try{b=await readFile(file)}catch{b=await readFile(path.join(dist,'index.html'));ext='.html'}res.writeHead(200,{'Content-Type':mime[ext]??'application/octet-stream'}).end(b)}catch{res.writeHead(500).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(getBrowserLaunchOptions()),report=[];
try{for(const width of [320,390,1440]){
 const participant={id:'p1',lastName:'Fixture',firstName:'Member',city:'Test city'};
 const team={id:'t1',name:'Fixture Team',description:'Synthetic team for responsive UX checks.',isActive:true,commanderUserId:'u1',memberships:[{id:'m1',status:'PENDING',participant}],posts:[{id:'post1',title:'Team news',body:'Reviewed text',kind:'NEWS',status:'PUBLISHED'}],members:[participant],historicalMembers:[]};
 const archived={id:null,name:'Archive Team',description:'Historical affiliation',isActive:false,members:[],historicalMembers:[participant],posts:[]};let membership=null,joinCalls=0,settingsWrites=0;
 const errors=[];
 const open=async actor=>{const ctx=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});await ctx.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin===base)return route.continue();let data=[];const body=req.method()==='PATCH'||req.method()==='POST'?req.postDataJSON():null;
  if(u.pathname==='/auth/refresh')data={accessToken:'synthetic',user:{id:'u1',role:actor==='admin'?'ADMIN':'PARTICIPANT',email:'fixture@example.test',participantId:'p1'}};
  else if(u.pathname==='/site-settings/public')data={settings:{branding:{siteName:'USD'},homepage:{blocks:[]},catalogs:{},legal:{}}};
  else if(u.pathname==='/participants/me')data={participant};
  else if(u.pathname==='/teams/admin')data={teams:[team],users:[{id:'u1',name:'Fixture Commander',email:'commander@example.test'}]};
  else if(u.pathname==='/teams/public')data=[team,archived];
  else if(u.pathname==='/teams/me')data={membership,commandedTeam:actor==='commander'?team:null};
  else if(u.pathname==='/teams/t1/join'){joinCalls++;membership={id:'mine',status:'PENDING',team:{id:'t1',name:team.name,isActive:true}};data=membership}
  else if(u.pathname==='/teams/t1/memberships/m1'&&req.method()==='PATCH'){team.memberships[0].status=body.status;data=team.memberships[0]}
  else if(u.pathname==='/teams/t1'&&req.method()==='PATCH'){settingsWrites++;Object.assign(team,body);data=team}
  else if(u.pathname.includes('/achievements'))data={teamId:'t1',scope:'CURRENT_PUBLIC_MEMBERS',stages:[],total:0};
  else if(u.pathname.includes('historical-final-configuration'))data={required:false};
  else if(u.pathname==='/auth/legal-consent')data={legalReady:false};
  else if(u.pathname==='/auth/newsletter-consent')data={consent:false};
  return route.fulfill({json:data});
 });const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return {ctx,page}};
 const capture=async(page,name)=>{const cookie=page.getByRole('button',{name:'Только необходимые',exact:true});if(await cookie.isVisible())await cookie.click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' has no page overflow');await page.screenshot({path:path.join(out,name+'-'+width+'.png')})};
 const admin=await open('admin');try{
  const page=admin.page;await page.goto(base+'/admin/teams');await page.locator('.team-team-list li button').first().click();const ws=page.locator('.team-workspace');await ws.waitFor();
  await ws.getByLabel('Поиск участника команды').fill('Missing');await ws.getByText('Никого не найдено.',{exact:false}).waitFor();await ws.getByLabel('Поиск участника команды').fill('');await ws.getByLabel('Статус участника команды').selectOption('PENDING');await ws.getByRole('button',{name:'Принять',exact:true}).click();await ws.getByText('Участник принят',{exact:true}).waitFor();
  await ws.getByLabel('Статус участника команды').selectOption('APPROVED');await capture(page,'admin-roster');
  await ws.getByRole('button',{name:'Новости и достижения',exact:true}).click();await ws.getByLabel('Заголовок публикации').fill('Unsaved draft');await ws.getByRole('button',{name:'Настройки',exact:true}).click();await ws.getByLabel('Поиск командира').fill('fixture');await ws.getByLabel('Поиск командира').press('Enter');await page.waitForTimeout(150);assert.equal(settingsWrites,0,'commander search Enter never saves team settings');assert.equal(await ws.getByLabel('Командир команды',{exact:true}).inputValue(),'u1');await capture(page,'admin-settings');
  await ws.getByRole('button',{name:'Новости и достижения',exact:true}).click();assert.equal(await ws.getByLabel('Заголовок публикации').inputValue(),'Unsaved draft');await capture(page,'admin-posts');
 }finally{await admin.ctx.close()}
 const member=await open('member');try{
  const page=member.page;await page.goto(base+'/teams/Fixture%20Team');const apply=page.getByRole('link',{name:'Вступить в команду',exact:true});await apply.waitFor();assert.equal(await apply.getAttribute('href'),'/participant?tab=team&teamId=t1');await capture(page,'public-team');await apply.click();await page.getByLabel('Команда для заявки',{exact:true}).waitFor();assert.equal(await page.getByLabel('Команда для заявки',{exact:true}).inputValue(),'t1');assert.equal(joinCalls,0);await page.getByRole('button',{name:'Подать заявку',exact:true}).click();await page.getByText('Ожидает решения командира',{exact:true}).waitFor();assert.equal(joinCalls,1);await capture(page,'member');
 }finally{await member.ctx.close()}
 const commander=await open('commander');try{const page=commander.page;await page.goto(base+'/participant?tab=team');await page.locator('.team-workspace').waitFor();await page.locator('.team-workspace').getByRole('button',{name:'Новости и достижения',exact:true}).click();assert.equal(await page.locator('.team-workspace').getByLabel('Командир команды',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Опубликовать',exact:true}).count(),0);await capture(page,'commander')}finally{await commander.ctx.close()}
 assert.deepEqual(errors,[]);report.push({width,status:'passed',scenarios:'admin filters, roster approval, draft retention, public→explicit join, commander role controls',overflow:false});
}}finally{await browser.close();await new Promise(r=>server.close(r));await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2))}
console.log(JSON.stringify(report,null,2));
