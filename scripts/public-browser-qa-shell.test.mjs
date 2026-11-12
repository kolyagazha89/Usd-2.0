import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPublicShell} from './public-browser-qa-shell.mjs';

function pageThatFailsOnce(){
 const calls={goto:0,reload:0,wait:0};
 const page={
  goto:async()=>{calls.goto++},
  reload:async()=>{calls.reload++},
  locator:()=>({first:()=>({waitFor:async()=>{calls.wait++;if(calls.wait===1)throw new Error('timeout waiting for shell')}})}),
 };
 return {page,calls};
}
test('retries a failed live shell exactly once without changing route or assertions',async()=>{
 const {page,calls}=pageThatFailsOnce(),row={route:'/rules',width:390};
 await loadPublicShell(page,'https://example.test/rules',row);
 assert.deepEqual(calls,{goto:1,reload:1,wait:2});
 assert.equal(row.shellReadRetried,true);
});
test('keeps a persistent missing shell as a hard failure, never disguising it as passed',async()=>{
 const {page,calls}=pageThatFailsOnce(),row={route:'/',width:1440};
 page.locator=()=>({first:()=>({waitFor:async()=>{calls.wait++;throw new Error('shell never shown')}})});
 await assert.rejects(loadPublicShell(page,'https://example.test/',row),/shell never shown/);
 assert.deepEqual(calls,{goto:1,reload:1,wait:2});
});
test('does not reload an already healthy shell',async()=>{
 const {page,calls}=pageThatFailsOnce(),row={route:'/login',width:390};
 page.locator=()=>({first:()=>({waitFor:async()=>{calls.wait++}})});
 await loadPublicShell(page,'https://example.test/login',row);
 assert.deepEqual(calls,{goto:1,reload:0,wait:1});
 assert.equal('shellReadRetried' in row,false);
});

test('privacy route uses bounded shell recovery after BOTH anonymous navigation roundtrips',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('./public-browser-qa.mjs',import.meta.url),'utf8');
 const segment=source.slice(source.indexOf("if(route==='/privacy'){"),source.indexOf("if(route==='/'||route==='/results')",source.indexOf("if(route==='/privacy'){")));
 assert.equal((segment.match(/loadPublicShell\(page,base\+'\/privacy',row\)/g)??[]).length,2);
 assert.doesNotMatch(segment,/page\.goto\(base\+'\/privacy'/);
});
