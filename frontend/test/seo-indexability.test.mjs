import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publicSeoMetadata, structuredDataForPage, isIndexablePublicRoute} from '../src/public/seo-model.ts';

test('public pages get a descriptive, distinct search title and summary',()=>{
 const stages=publicSeoMetadata('/stages',null);
 const news=publicSeoMetadata('/news',null);
 assert.match(stages.title,/Этапы|Календарь/);
 assert.match(stages.description,/автозвук/);
 assert.notEqual(stages.description,news.description);
 assert.match(news.title,/Новости/);
});

test('published stage metadata includes event name and city, not generic card text',()=>{
 const stage={id:'stage-1',name:'USD Winter Cup Краснодар',city:'Краснодар',date:'2026-11-28T10:00:00.000Z',venue:'FRESH Auto',address:'Дзержинского 231/1',status:'PUBLISHED'};
 const result=publicSeoMetadata('/stages/stage-1',stage);
 assert.match(result.title,/USD Winter Cup Краснодар/);
 assert.match(result.description,/Краснодар/);
 assert.equal(result.indexable,true);
 const schema=structuredDataForPage('/stages/stage-1',stage,'https://app.usd-russia.ru');
 assert.equal(schema['@type'],'SportsEvent');
 assert.equal(schema.name,stage.name);
 assert.equal(schema.location.address.addressLocality,'Краснодар');
 assert.equal(schema.startDate,stage.date);
});

test('private token pages and missing paths cannot be indexed',()=>{
 assert.equal(isIndexablePublicRoute('/usd-id/'+'a'.repeat(48)),false);
 assert.equal(isIndexablePublicRoute('/nonsense-404'),false);
 assert.equal(isIndexablePublicRoute('/stages/abc'),true);
 assert.equal(isIndexablePublicRoute('/news'),true);
});

test('home page uses Organization structured data without private fields',()=>{
 const schema=structuredDataForPage('/',null,'https://app.usd-russia.ru');
 assert.equal(schema['@type'],'Organization');
 assert.equal(schema.url,'https://app.usd-russia.ru/');
 assert.equal(schema.name,'USD — Ultimate Sound Destruction');
 assert.equal(schema.email,undefined);
});

test('nginx serves robots as text, dynamic sitemap as XML and rejects unknown SPA paths',async()=>{
 const conf=await readFile(new URL('../nginx.conf',import.meta.url),'utf8');
 const robots=await readFile(new URL('../public/robots.txt',import.meta.url),'utf8');
 assert.match(conf,/location = \/sitemap\.xml/);
 assert.match(conf,/proxy_pass\s+http:/);
 assert.match(conf,/location = \/robots\.txt/);
 assert.match(conf,/return 404/);
 assert.match(conf,/X-Robots-Tag/);
 // $uri changes to /index.html after SPA rewrite. Only the immutable original
 // request URI can reliably keep private routes noindexed.
 assert.match(conf,/map \$request_uri \$usd_robots_tag/);
 assert.match(conf,/login\|verify-email/);
 assert.ok(conf.includes('~^/venue/live/?$ 1;'));
 assert.ok(conf.includes('~^/venue/live([?]|$) "noindex, nofollow";'));
 assert.match(conf,/offline-event/);
 assert.match(robots,/Sitemap: https:\/\/app\.usd-russia\.ru\/sitemap\.xml/);
 assert.match(robots,/Disallow: \/admin/);
 assert.match(robots,/Disallow: \/participant/);
});
