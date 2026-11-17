import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const nginx=await readFile(new URL('../nginx.conf',import.meta.url),'utf8');
const publisher=await readFile(new URL('../../.github/workflows/publish-home-pc-images.yml',import.meta.url),'utf8');
test('owned app host permanently redirects public paths to primary without rewriting tokens or querystrings',()=>{
 assert.match(nginx,/app\.usd-russia\.ru\s+1;/);
 assert.match(nginx,/if \(\$usd_move_to_primary\) \{\s*return 301 https:\/\/usd-russia\.ru\$request_uri;/);
 assert.doesNotMatch(nginx,/return 301 https:\/\/\$host/);
 assert.match(nginx,/server_name _;/);
});
test('old PWA push workers and exact release identity remain reachable for installed browsers and secure deployment',()=>{
 for(const safe of ['/usd-release.json','/usd-push-sw.js','/usd-offline-sw.js','/manifest.webmanifest'])
  assert.match(nginx,new RegExp(safe.replaceAll('.',String.raw'\.').replaceAll('/','\\/')+'\\s+1;'));
});
test('new signed GHCR builds pre-render canonical, OG and robots on primary without a repo variable',()=>{
 assert.match(publisher,/origin="\$\{REQUESTED:-https:\/\/usd-russia\.ru\}"/);
 assert.match(publisher,/VITE_PUBLIC_SITE_ORIGIN=\$\{\{ steps\.public_origin\.outputs\.origin \}\}/);
});
