import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
const script=await readFile(new URL('../public/usd-legacy-redirect.js',import.meta.url),'utf8');

function navigation(hostname,overrides={}){
 const replaces=[];
 const location={
  hostname,protocol:'https:',pathname:'/stages',search:'?season=2026',
  hash:'#registration',replace(url){replaces.push(url)},...overrides,
 };
 runInNewContext(script,{window:{location}},{timeout:1000});
 return replaces;
}

test('early classic script redirects old app before React, even when CloudPub rewrites Host',()=>{
 const link=index.indexOf('<script src="/usd-legacy-redirect.js"></script>');
 const react=index.indexOf('<script type="module" src="/src/main.tsx"></script>');
 assert.ok(link>0 && link<react,'redirect must run before app boot and auth/network requests');
 assert.deepEqual(navigation('app.usd-russia.ru'),
  ['https://usd-russia.ru/stages?season=2026#registration']);
});

test('primary, API, localhost and unrelated hosts never redirect or loop',()=>{
 for(const host of ['usd-russia.ru','api.usd-russia.ru','localhost','evil.example','app.usd-russia.ru.evil.example']){
  assert.deepEqual(navigation(host),[],host);
 }
});

test('legacy page uses only exact HTTPS destination and preserves encoded path/query/hash',()=>{
 assert.deepEqual(navigation('app.usd-russia.ru',{
  pathname:'/documents/photoProfileConsent',search:'?next=%2Fregistration%3Fa%3D1',hash:'#form',
 }),['https://usd-russia.ru/documents/photoProfileConsent?next=%2Fregistration%3Fa%3D1#form']);
 assert.deepEqual(navigation('app.usd-russia.ru',{protocol:'file:'}),[]);
});
