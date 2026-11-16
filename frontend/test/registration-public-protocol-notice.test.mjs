import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('online competition registration explicitly informs about public official FIO and score', async()=>{
 const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
 const idx=app.indexOf('registration-rules-consent');
 assert.ok(idx>0,'the main participant registration confirmation section exists');
 const section=app.slice(idx,idx+2000);
 assert.match(section,/официальн.{0,45}протокол/i);
 assert.match(section,/ФИО/);
 assert.match(section,/результат/i);
 assert.match(section,/правов.{0,25}основани/i);
 assert.match(section,/\/privacy/);
 assert.doesNotMatch(section,/input.{0,80}protocolConsent/i,'notice must not masquerade as a valid dissemination consent');
});
