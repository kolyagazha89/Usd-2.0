import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('both statistics routes use frozen team identity for list keys, not display names',async()=>{
 for(const path of ['../src/admin/StatisticsPage.tsx','../src/admin/pages/StatisticsPage.tsx']){
  const source=await readFile(new URL(path,import.meta.url),'utf8');
  assert.match(source,/analytics\.teams\.map\(/);
  assert.match(source,/key=\{x\.key\?\?x\.name\}/,
   'two teams with the same display name must not collide');
  // Other charts (e.g. vibration) legitimately use their own unique names as keys.
  assert.doesNotMatch(source,/analytics\.teams\.map\(\(x:any\)=><div className="statistics-bar-row" key=\{x\.name\}/);
 }
});
