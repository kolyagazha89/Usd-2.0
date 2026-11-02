import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('team page separates verified historical team identity from current roster',async()=>{
 const [page,component]=await Promise.all([
  readFile(new URL('../src/public/PublicTeamsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/teams/TeamStageAchievements.tsx',import.meta.url),'utf8'),
 ]);
 assert.match(page,/mode="inspected"/);
 assert.match(component,/inspected-achievements/);
 assert.match(component,/mode='current'/);
 assert.match(component,/Команда зафиксирована при первой успешной инспекции/);
 assert.match(component,/Старые этапы без подтверждённой фиксации не приписываются/);
 assert.match(component,/Это не командный зачёт по очкам/);
 assert.match(component,/Пока нет опубликованных результатов с подтверждённым составом/);
});
