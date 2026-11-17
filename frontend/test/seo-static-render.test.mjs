import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderSeoDocument,staticSeoRoutes} from '../scripts/generate-seo-pages.mjs';

const html='<html lang="ru"><head><meta name="description" content="Generic"><meta property="og:title" content="Generic"><meta property="og:description" content="Generic"><title>Generic</title></head><body><div id="root"></div></body></html>';

test('static public routes are rendered with distinctive server-visible metadata',()=>{
 const stages=renderSeoDocument(html,'/stages');
 const news=renderSeoDocument(html,'/news');
 assert.match(stages,/<title>Этапы соревнований по автозвуку/);
 assert.match(stages,/rel="canonical" href="https:\/\/app\.usd-russia\.ru\/stages"/);
 assert.match(news,/<title>Новости соревнований по автозвуку/);
 assert.notEqual(stages,news);
 assert.ok(staticSeoRoutes.length>=12);
});

test('prerender keeps the React mount point and includes structured organization data on home',()=>{
 const home=renderSeoDocument(html,'/');
 assert.match(home,/<div id="root"><\/div>/);
 assert.match(home,/type="application\/ld\+json"/);
 assert.match(home,/"@type":"Organization"/);
 assert.match(home,/property="og:url"/);
 assert.throws(()=>renderSeoDocument(html,'/admin'));
});

test('nginx uses static route HTML and still falls back to React for dynamic stage URLs',async()=>{
 const nginx=await readFile(new URL('../nginx.conf',import.meta.url),'utf8');
 assert.match(nginx,/try_files \$uri \$uri\/ \$uri\.html @spa/);
 assert.match(nginx,/rewrite \^ \/index\.html last/);
});

test('primary-domain SEO build generates canonical and sitemap on the approved origin',async()=>{
 const {mkdtemp,rm,readFile,writeFile}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {generateStaticSeoPages}=await import('../scripts/generate-seo-pages.mjs');
 const tmp=await mkdtemp(join(tmpdir(),'usd-domain-'));
 try{
  await writeFile(join(tmp,'index.html'),html);
  await writeFile(join(tmp,'robots.txt'),'User-agent: *\nDisallow: /admin\nSitemap: https://app.usd-russia.ru/sitemap.xml\n');
  await generateStaticSeoPages(tmp,'https://usd-russia.ru');
  const stages=await readFile(join(tmp,'stages.html'),'utf8');
  const robots=await readFile(join(tmp,'robots.txt'),'utf8');
  assert.match(stages,/rel="canonical" href="https:\/\/usd-russia\.ru\/stages"/);
  assert.match(stages,/property="og:image" content="https:\/\/usd-russia\.ru\//);
  assert.match(robots,/Sitemap: https:\/\/usd-russia\.ru\/sitemap\.xml/);
  assert.match(robots,/Disallow: \/admin/);
 }finally{await rm(tmp,{recursive:true,force:true});}
});

test('SEO export rejects unexpected canonical origins',async()=>{
 const {generateStaticSeoPages}=await import('../scripts/generate-seo-pages.mjs');
 for(const bad of ['https://evil.example','http://usd-russia.ru','https://usd-russia.ru.evil.example','https://user@usd-russia.ru']){
  await assert.rejects(()=>generateStaticSeoPages('/tmp/never-exists',bad),/origin|domain|canonical/i);
 }
});
