import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ANALYTICS_CONSENT_KEY,publicTrafficPath,mayRecordTraffic} from '../src/public/traffic-policy.ts';

test('traffic route is a broad public category, never a user or record identifier',()=>{
 assert.equal(ANALYTICS_CONSENT_KEY,'usd_traffic_analytics_consent_v1');
 for(const [path,expected] of [['/','/'],['/stages/secret-stage?stageId=a','/stages'],['/participants/some-id','/participants'],['/news/item','/news'],['/results?stageId=x','/results']])
  assert.equal(publicTrafficPath(path),expected);
 for(const value of ['/admin','/participant','/participant/cars','/offline-event','/usd-id/secret','/auth/login','not-a-path'])
  assert.equal(publicTrafficPath(value),null);
});
test('client dedupe is thirty minutes without a tracking user ID',()=>{
 const now=Date.UTC(2026,10,4,12);
 assert.equal(mayRecordTraffic(now,null),true);
 assert.equal(mayRecordTraffic(now,now),false);
 assert.equal(mayRecordTraffic(now,now-30*60*1000),true);
 assert.equal(mayRecordTraffic(now,'invalid'),true);
});
test('non-essential pageview is strictly opted in, anonymous, revocable, and excluded from admin/offline routes',async()=>{
 const [cookie,app,tracking,api,footer,stats,controller]=await Promise.all([
  readFile(new URL('../src/CookieNotice.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/App.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/public/traffic-tracking.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/api.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/public/PremiumShell.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/StatisticsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../../backend/src/traffic/traffic.controller.ts',import.meta.url),'utf8'),
 ]);
 assert.match(cookie,/onClick=\{\(\)=>dismiss\(false\)\}/);
 assert.match(cookie,/onClick=\{\(\)=>dismiss\(true\)\}/);
 assert.match(cookie,/usd:analytics-consent-changed/);
 assert.match(footer,/usd:cookie-open/);
 assert.match(app,/recordConsentedTrafficVisit\(path\)/);
 assert.match(tracking,/getItem\(ANALYTICS_CONSENT_KEY\)!=='yes'/);
 assert.match(tracking,/navigator\.doNotTrack==='1'/);
 assert.match(tracking,/window\.sessionStorage\.setItem/);
 assert.match(api,/credentials:'omit',mode:'cors'/);
 assert.match(api,/method:'POST'/);
 assert.match(stats,/Посещения сайта и устройства/);
 assert.match(stats,/Уникальные люди не определяются/);
 assert.match(controller,/@Roles\('ADMIN'\)/);
 assert.match(controller,/@Public\(\)/);
});
