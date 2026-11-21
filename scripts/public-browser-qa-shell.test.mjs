import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadPublicShell} from './public-browser-qa-shell.mjs';

function fixture({status=200,wait,styles}={}){
 const calls=[];
 const page={
  goto:async url=>{calls.push(url);return {ok:()=>status===200,status:()=>status}},
  locator:()=>({first:()=>({waitFor:async()=>{await wait?.()}})}),
  waitForFunction:async()=>{await styles?.()},
 };
 return {page,calls};
}
test('retries the requested URL once and can use a replacement tab after a renderer failure',async()=>{
 const dead=fixture({wait:()=>{throw new Error('Page crashed')}}),healthy=fixture();
 const row={route:'/rules',width:390},url='https://example.test/rules';
 const attempts=[];
 assert.equal(await loadPublicShell(async replace=>{attempts.push(replace);return replace?healthy.page:dead.page},url,row),healthy.page);
 assert.deepEqual(attempts,[false,true]);
 assert.deepEqual(dead.calls,[url]);
 assert.deepEqual(healthy.calls,[url]);
 assert.equal(row.shellReadRetried,true);
});
test('a persistent HTTP error or missing stylesheet fails after one retry',async()=>{
 for(const {f,error} of [
  {f:fixture({status:503}),error:/HTTP 503/},
  {f:fixture({styles:()=>{throw new Error('Stylesheet unavailable')}}),error:/Stylesheet unavailable/},
 ]){
  await assert.rejects(loadPublicShell(async()=>f.page,'https://example.test/',{}),error);
  assert.equal(f.calls.length,2);
 }
});
test('does not revisit an already healthy shell',async()=>{
 const f=fixture(),row={route:'/login',width:390};
 await loadPublicShell(async()=>f.page,'https://example.test/login',row);
 assert.deepEqual(f.calls,['https://example.test/login']);
 assert.equal('shellReadRetried' in row,false);
});
test('privacy route uses bounded shell recovery after both anonymous navigation roundtrips',async()=>{
 const source=await readFile(new URL('./public-browser-qa.mjs',import.meta.url),'utf8');
 const start=source.indexOf("if(route==='/privacy'){");
 const segment=source.slice(start,source.indexOf("if(route==='/'||route==='/results')",start));
 assert.equal((segment.match(/loadPublicShell\(getPage,base\+'\/privacy',row\)/g)??[]).length,2);
});
