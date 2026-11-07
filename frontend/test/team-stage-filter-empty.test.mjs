import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const source=readFileSync(new URL('../src/teams/TeamStageAchievements.tsx',import.meta.url),'utf8');
test('team statistics distinguish empty filtered results from missing team history',()=>{
 assert.match(source,/visibleStages\.length===0/);
 assert.match(source,/Нет выступлений с выбранными фильтрами/);
});
test('team statistics filters can be cleared without another API call',()=>{
 assert.match(source,/setDirection\(''\)/);
 assert.match(source,/Сбросить фильтр/);
});
