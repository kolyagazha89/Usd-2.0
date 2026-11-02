import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('a public team page loads published stage results only for real USD teams',async()=>{
 const [page,component,css,mine]=await Promise.all([
  readFile(new URL('../src/public/PublicTeamsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/teams/TeamStageAchievements.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/teams/teams.css',import.meta.url),'utf8'),
  readFile(new URL('../src/participant/MyTeamPage.tsx',import.meta.url),'utf8'),
 ]);
 assert.match(page,/team\.id&&<><TeamStageAchievements teamId=\{team\.id\} mode="inspected"\/>/);
 assert.match(page,/<TeamStageAchievements teamId=\{team\.id\}\/>/);
 assert.match(mine,/member\?\.status==='APPROVED'&&member\.team\?\.id/);
 assert.match(mine,/TeamStageAchievements teamId=/);
 assert.match(component,/apiGet<TeamStageAchievementResponse>\('\/teams\/public\/'\+encodeURIComponent\(teamId\)/);
 assert.match(component,/inspected\?'\/inspected-achievements':'\/achievements'/);
 assert.match(component,/Показаны опубликованные результаты участников, состоящих в команде сейчас/);
 assert.match(component,/Это не исторический командный зачёт/);
 assert.match(component,/new Date\(stage\.date\)\.toLocaleDateString\('ru-RU'\)/);
 assert.match(component,/data\.truncated&&/,'user sees partial historical listing');
 assert.match(component,/result\.unit==='MPS'\?'м\/с'/);
 assert.match(component,/return\(\)=>\{active=false\}/,'ignore results for unmounted team profiles');
 assert.match(css,/@media\(max-width:520px\)/);
});

test('team statistics are truthful about current membership and partial result caps',async()=>{
 const [service,component,admin,css]=await Promise.all([
  readFile(new URL('../../backend/src/teams/teams.service.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/teams/TeamStageAchievements.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/TeamsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/teams/teams.css',import.meta.url),'utf8'),
 ]);
 assert.match(service,/const performers = new Set<string>\(\)/);
 assert.match(service,/const directions = new Map<string, number>\(\)/);
 assert.match(service,/summary: \{/);
 assert.match(component,/личных призовых мест/);
 assert.match(component,/личных первых мест/);
 assert.match(component,/Фильтр выступлений по направлению/);
 assert.match(component,/visibleStages\.map\(stage=>/);
 assert.match(component,/Статистика и фильтры рассчитаны только по первым 500 результатам/);
 assert.match(admin,/pendingReviews=teams\.flatMap/);
 assert.match(admin,/post\.status==='IN_REVIEW'/);
 assert.match(admin,/setSelected\(post\.teamId\)/);
 assert.match(css,/team-achievement-stats/);
 assert.match(css,/team-review-list/);
});
