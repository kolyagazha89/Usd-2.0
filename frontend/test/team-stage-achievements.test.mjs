import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('a public team page loads published stage results only for real USD teams',async()=>{
 const [page,component,css]=await Promise.all([
  readFile(new URL('../src/public/PublicTeamsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/teams/TeamStageAchievements.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/teams/teams.css',import.meta.url),'utf8'),
 ]);
 assert.match(page,/team\.id&&<TeamStageAchievements teamId=\{team\.id\}\/>/);
 assert.match(component,/apiGet<TeamStageAchievementResponse>\('\/teams\/public\/'\+encodeURIComponent\(teamId\)\+'\/achievements'\)/);
 assert.match(component,/Показаны опубликованные результаты участников, состоящих в команде сейчас/);
 assert.match(component,/Это не исторический командный зачёт/);
 assert.match(component,/new Date\(stage\.date\)\.toLocaleDateString\('ru-RU'\)/);
 assert.match(component,/data\.truncated&&/,'user sees partial historical listing');
 assert.match(component,/result\.unit==='MPS'\?'м\/с'/);
 assert.match(component,/return\(\)=>\{active=false\}/,'ignore results for unmounted team profiles');
 assert.match(css,/@media\(max-width:520px\)/);
});
