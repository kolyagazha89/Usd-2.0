import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('team standings requests the existing public seasons endpoint, not a nonexistent nested path',async()=>{
 const [component,controller]=await Promise.all([
  read('../src/teams/TeamStandings.tsx'),
  read('../../backend/src/seasons/seasons.controller.ts'),
 ]);
 // Production permits anonymous GET /seasons. GET /seasons/public is interpreted
 // as GET /seasons/:id and fails with "Сезон не найден" (verified on Ubuntu).
 assert.match(controller,/@Public\(\)\s*@Get\(\)\s*findAll/);
 assert.match(component,/apiGet\('\/seasons'\)/);
 assert.doesNotMatch(component,/apiGet\('\/seasons\/public'\)/);
});

test('browser fixtures must emulate the real public seasons endpoint instead of masking the bug',async()=>{
 const qa=await read('../../scripts/candidate-browser-qa.mjs');
 assert.match(qa,/if\(p==='\/seasons'\)return \[season\]/);
 assert.doesNotMatch(qa,/if\(p==='\/seasons'\|\|p==='\/seasons\/public'\)/);
});
