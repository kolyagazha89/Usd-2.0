import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const source=readFileSync(new URL('../src/teams/TeamWorkspace.tsx',import.meta.url),'utf8');
test('team post editor has a two-step review before submission',()=>{
 assert.match(source,/const \[postStep,setPostStep\]=useState/);
 assert.match(source,/Шаг \{postStep\} из 2/);
 assert.match(source,/Проверить публикацию/);
 assert.match(source,/Вернуться к редактированию/);
 assert.match(source,/Подтвердить отправку/);
});
test('post save keeps draft on API failure',()=>{
 assert.match(source,/await \(editing\?apiPatch:apiPost\)/);
 assert.match(source,/await onChanged\(\);setDraft\(emptyPost\)/);
});
