import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveUsdApiBase} from '../src/venue-api-config.ts';

test('the public release still uses the configured HTTPS API',()=>{
 assert.equal(resolveUsdApiBase(undefined,false,''),'https://api.usd-russia.ru');
 assert.equal(resolveUsdApiBase('https://api.example.test///',false,''),'https://api.example.test');
 assert.equal(resolveUsdApiBase('api.example.test',undefined,undefined),'https://api.example.test');
});
test('venue mode permits only the same-origin proxy and refuses internet fallbacks',()=>{
 assert.equal(resolveUsdApiBase('https://api.usd-russia.ru',true,'/venue-api'),'/venue-api');
 for(const unsafe of [undefined,'','https://api.usd-russia.ru','//api.usd-russia.ru','/venue-api/','/api','javascript:foo'])
  assert.throws(()=>resolveUsdApiBase('https://api.usd-russia.ru',true,unsafe),/локального сервера/);
});
test('the browser loads no-store venue configuration before Vite and production default is off',async()=>{
 const [html,nginx,live,venue]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../nginx.conf',import.meta.url),'utf8'),
  readFile(new URL('../public/usd-venue-config.js',import.meta.url),'utf8'),
  readFile(new URL('../../deploy/venue-lan/config/venue-config.js',import.meta.url),'utf8'),
 ]);
 assert.ok(html.indexOf('src="/usd-venue-config.js"')<html.indexOf('src="/src/main.tsx"'));
 assert.match(nginx,/\/usd-venue-config\.js "no-store"/);
 assert.match(live,/__USD_VENUE_MODE__ = false/);
 assert.match(venue,/__USD_VENUE_MODE__ = true/);
 assert.match(venue,/__USD_VENUE_API_BASE__ = '\/venue-api'/);
});

test('laptop LAN proxy blocks external API even if a bootstrap script fails to load',async()=>{
 const {readFile}=await import('node:fs/promises');
 const [caddy,compose]=await Promise.all([
  readFile(new URL('../../deploy/venue-lan/Caddyfile',import.meta.url),'utf8'),
  readFile(new URL('../../deploy/venue-lan/compose.yaml',import.meta.url),'utf8'),
 ]);
 assert.match(caddy,/Content-Security-Policy "connect-src 'self'/);
 assert.match(caddy,/tls internal/);
 assert.match(caddy,/handle_path \/venue-api\/\*/);
 assert.match(compose,/ports:\s*[\s\S]*?\$\{VENUE_BIND_IP\}:443:443/);
 assert.doesNotMatch(compose,/5432:5432|0\.0\.0\.0:443:443/);
 assert.match(compose,/S3_ENDPOINT: http:\/\/rustfs:9000/);
});
