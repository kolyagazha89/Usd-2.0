// Real Chromium, full application UI, real TeamsModule HTTP API on synthetic PostgreSQL.
// Ancillary profile/settings/session reads use synthetic fixtures; all team requests reach Nest.
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const fixture=JSON.parse(await readFile(process.env.USD_TEAMS_BROWSER_FIXTURE??'/tmp/usd-teams-browser-fixture.json','utf8'));
const output=process.env.USD_TEAMS_BROWSER_OUTPUT??'/tmp/usd-teams-browser-qa';await mkdir(output,{recursive:true});
const runTag=Date.now().toString(36);
const frontend='http://127.0.0.1:55441',api='http://127.0.0.1:55440',errors=[],proof=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox']});
const backend=async(method,url,body)=>{const response=await fetch(api+url,{method,headers:{Authorization:'Bearer '+fixture.actors.admin.accessToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.ok(response.ok,method+' '+url+' '+response.status);return response.json()};
async function open(actor,width){
 const context=await browser.newContext({viewport:{width,height:width<600?844:1000},deviceScaleFactor:1});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===frontend)return route.continue();
  if(url.origin!==api)return route.abort();
  if(url.pathname.startsWith('/teams'))return route.continue();
  let data=[];
  if(url.pathname==='/auth/refresh')data=fixture.actors[actor]??null;
  else if(url.pathname==='/participants/me')data={participant:fixture.actors[actor]?.participant};
  else if(url.pathname.includes('historical-final-configuration'))data={required:false};
  else if(url.pathname==='/auth/newsletter-consent')data={consent:false};
  else if(url.pathname==='/auth/legal-consent')data={legalReady:false};
  else if(url.pathname.startsWith('/site-settings'))data={settings:{branding:{siteName:'USD'},homepage:{},catalogs:{},legal:{},navigation:{}}};
  else if(url.pathname.startsWith('/media/'))return route.fulfill({status:404,body:''});
  return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':frontend,'Access-Control-Allow-Credentials':'true'},body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));return {context,page};
}
async function capture(page,name){const cookie=page.getByRole('button',{name:'Понятно',exact:true});if(await cookie.count())await cookie.click();if(name==='member-390'||name==='commander-390'){const tops=await page.locator('.participant-tabs a').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));assert.equal(tops.length,5);assert.ok(Math.max(...tops)-Math.min(...tops)<2,'Five cabinet tabs must fit one mobile row')}await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' horizontal overflow');proof.push(name)}
try{
 // Restore only these synthetic browser actors after an interrupted test run.
 for(const team of (await backend('GET','/teams/admin')).teams.filter(t=>t.commanderUserId===fixture.actors.commander.user.id))await backend('PATCH','/teams/'+team.id,{commanderUserId:null});
 const left=await fetch(api+'/teams/me/leave',{method:'POST',headers:{Authorization:'Bearer '+fixture.actors.member.accessToken}});assert.ok(left.ok);
 for(const width of [1440,390]){
  const admin=await open('admin',width),member=await open('member',width),commander=await open('commander',width),publicView=await open('',width);
  try{
   const name='Команда браузера '+runTag+' '+width,title='Победа команды '+width;
   await admin.page.goto(frontend+'/admin/teams');await admin.page.getByLabel('Название новой команды',{exact:true}).fill(name);await admin.page.getByRole('button',{name:'Создать команду',exact:true}).click();
   const workspace=admin.page.getByRole('region',{name:'Управление командой '+name});await workspace.waitFor();
   await workspace.getByLabel('Командир команды',{exact:true}).selectOption(fixture.actors.commander.user.id);
   // Commander has one team; desktop assignment is revoked at the end before mobile creates its team.
   await workspace.getByLabel('Описание команды',{exact:true}).fill('Синтетическая команда: состав, достижения и история.');await workspace.getByRole('button',{name:'Сохранить команду',exact:true}).click();await workspace.getByText('Команда сохранена',{exact:true}).waitFor();
   const team=(await backend('GET','/teams/admin')).teams.find(t=>t.name===name);assert.ok(team?.id);
   await member.page.goto(frontend+'/participant?tab=team');await member.page.getByLabel('Команда для заявки',{exact:true}).selectOption(team.id);await member.page.getByRole('button',{name:'Подать заявку',exact:true}).click();await member.page.getByText('Ожидает решения командира',{exact:true}).waitFor();
   await commander.page.goto(frontend+'/participant?tab=team');await commander.page.getByRole('button',{name:'Принять',exact:true}).click();await commander.page.getByText('Участник принят',{exact:true}).waitFor();
   await member.page.getByRole('button',{name:'Обновить команды',exact:true}).click();await member.page.getByText('Вы в составе команды',{exact:true}).waitFor();
   await commander.page.getByLabel('Заголовок публикации',{exact:true}).fill(title);await commander.page.getByLabel('Текст публикации',{exact:true}).fill('Проверенная новость команды.\nВторой абзац без HTML.');await commander.page.getByRole('button',{name:'Отправить на проверку',exact:true}).click();await commander.page.getByText('Материал отправлен на проверку',{exact:true}).waitFor();
   assert.equal(await commander.page.getByRole('button',{name:'Опубликовать',exact:true}).count(),0);
   await publicView.page.goto(frontend+'/teams/'+encodeURIComponent(name));await publicView.page.getByRole('heading',{name,exact:true}).waitFor();assert.equal(await publicView.page.getByRole('heading',{name:title,exact:true}).count(),0,'Unreviewed post remains private');
   await admin.page.getByRole('button',{name:'Обновить',exact:true}).click();await admin.page.getByRole('button',{name:'Опубликовать',exact:true}).click();await admin.page.getByText('Материал опубликован',{exact:true}).waitFor();
   await publicView.page.reload();await publicView.page.getByRole('heading',{name:title,exact:true}).waitFor();await publicView.page.getByRole('link',{name:/Синтетический Иван/}).waitFor();
   await capture(admin.page,'admin-'+width);await capture(member.page,'member-'+width);await capture(commander.page,'commander-'+width);await capture(publicView.page,'public-'+width);
   assert.ok(await member.page.getByLabel('Команда для заявки',{exact:true}).count()===0);
   await member.page.getByRole('button',{name:'Выйти из команды',exact:true}).click();await member.page.getByRole('button',{name:'Подтвердить выход',exact:true}).click();await member.page.getByLabel('Команда для заявки',{exact:true}).waitFor();
   await admin.page.getByRole('button',{name:'Архивировать команду',exact:true}).click();await admin.page.getByRole('button',{name:'Подтвердить статус',exact:true}).click();await admin.page.getByText('Статус команды обновлён',{exact:true}).waitFor();
   await commander.page.getByRole('button',{name:'Обновить команды',exact:true}).click();await commander.page.getByText('Команда в архиве',{exact:true}).waitFor();assert.ok(await commander.page.getByRole('button',{name:'Сохранить команду',exact:true}).isDisabled());
   await workspace.getByLabel('Командир команды',{exact:true}).selectOption('');await workspace.getByRole('button',{name:'Сохранить команду',exact:true}).click();await workspace.getByText('Команда сохранена',{exact:true}).waitFor();
   assert.equal((await backend('GET','/teams/admin')).teams.find(t=>t.id===team.id).isActive,false);
  }catch(error){for(const [label,view] of Object.entries({admin,member,commander,publicView})){await view.page.screenshot({path:path.join(output,'failure-'+label+'-'+width+'.png'),fullPage:true});console.error(label,view.page.url(),(await view.page.locator('body').innerText()).slice(0,500))}console.error('Page errors:',errors);throw error}finally{await Promise.all([admin.context.close(),member.context.close(),commander.context.close(),publicView.context.close()])}
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'result.json'),JSON.stringify({date:new Date().toISOString(),proof,errors,backend:'real TeamsModule + PostgreSQL 18; synthetic ancillary session/settings/profile responses'},null,2));console.log('Chromium team workflows passed at 1440px and 390px: create, assignment, join, approval, submit, publish, public display, leave, archive and revocation. Screenshots: '+output);
}finally{await browser.close()}
