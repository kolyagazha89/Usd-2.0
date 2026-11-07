import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const bold=text=>({type:'paragraph',text,runs:[{text,bold:true}]});
const synthetic=[bold('3. Классы SPL и ограничения.'),bold('SPL Limited 2.0'),{type:'paragraph',text:'Ограничение мощности: 4000 Вт. '+ 'Полный текст условия сохраняется при поиске. '.repeat(12)},bold('129.9 dB 139.9 dB 149.9 dB 159.9 dB'),{type:'list-item',ordered:true,text:'Соседнее условие'},bold('Deadly Door'),{type:'table',rows:[['Класс','Лимит','Дополнение'],['SPL Limited','4000 Вт','Текст таблицы']]},bold('Gate 1-6.')];
const published=process.env.USD_RULES_QA_DOCUMENT?JSON.parse(await readFile(process.env.USD_RULES_QA_DOCUMENT,'utf8')):{blocks:synthetic,createdAt:'2026-11-01T00:00:00Z',url:'/rules.docx'};
const settings={branding:{siteName:'USD'},homepage:{blocks:[]},legal:{},registration:{rulesDocument:{published}}};
const out=path.resolve(process.env.USD_RULES_QA_OUTPUT??'rules-browser-qa');await mkdir(out,{recursive:true});
const dist=path.join(root,'frontend/dist'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(dist,'.'+pathname);if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return}let body,ext=path.extname(file);try{body=await readFile(file)}catch{body=await readFile(path.join(dist,'index.html'));ext='.html'}res.writeHead(200,{'Content-Type':mime[ext]??'application/octet-stream'}).end(body)}catch{res.writeHead(500).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(getBrowserLaunchOptions());const report=[];
try{for(const width of [320,390,768,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();if(u.pathname==='/site-settings/public')return route.fulfill({json:{settings}});if(u.pathname.includes('/auth/'))return route.fulfill({status:401,json:{message:'Unauthorized'}});return route.fulfill({json:[]})});
 await page.goto(base+'/rules',{waitUntil:'networkidle'});await page.locator('.public-rules-rich-document').waitFor();const cookie=page.getByRole('button',{name:'Только необходимые',exact:true});if(await cookie.isVisible())await cookie.click();
 const article=page.locator('.public-rules-rich-document');assert.equal(await article.locator(':scope > *').count(),published.blocks.length);
 assert.equal(await page.locator('.public-rules-sidebar nav a').filter({hasText:'129.9 dB'}).count(),0,'dB row is not a heading');
 assert.equal(await page.locator('#rules-contents a').filter({hasText:/^SPL Limited 2\.0$/}).count(),1);
 const original=await article.innerText();await page.screenshot({path:path.join(out,'top-'+width+'.png')});
 const toggle=page.getByRole('button',{name:/Оглавление ·/});if(width<=760){assert.ok(await toggle.isVisible());await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');await page.screenshot({path:path.join(out,'contents-'+width+'.png')})}
 const link=page.getByRole('link',{name:'SPL Limited 2.0',exact:true});const anchor=await link.getAttribute('href');await link.focus();await page.keyboard.press('Enter');await page.waitForURL(url=>url.hash===anchor);const hash=new URL(page.url()).hash;assert.ok(hash.startsWith('#rules-doc-heading-'));assert.equal(await page.evaluate(()=>document.activeElement.id),hash.slice(1));if(width<=760)assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 await page.screenshot({path:path.join(out,'reading-'+width+'.png')});
 const textSize=await article.locator('p').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));assert.ok(textSize>=16,'mobile reading text is at least16px');
 await page.getByRole('textbox',{name:'Поиск по регламенту'}).fill('4000');assert.equal(await article.innerText(),original,'search preserves full source text');assert.equal(await article.locator(':scope > *').count(),published.blocks.length);assert.ok(await article.locator('mark').count()>0);assert.ok(await page.locator('[data-rules-match="true"]').count()>0);
 await page.getByRole('button',{name:'Следующее совпадение'}).click();await page.screenshot({path:path.join(out,'search-'+width+'.png')});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow');assert.equal(errors.length,0,errors.join('\n'));
 report.push({width,blocks:published.blocks.length,textSize,headings:await page.locator('.public-rules-sidebar nav a').count(),overflow:false,status:'passed'});await context.close();
}}finally{await browser.close();await new Promise(r=>server.close(r));await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2))}
console.log(JSON.stringify(report,null,2));
