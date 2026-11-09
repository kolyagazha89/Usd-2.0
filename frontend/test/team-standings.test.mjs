import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sortTeamStandings} from '../src/teams/team-standings-model.ts';

const teams=[
 {teamId:'b',teamName:'Бета',firstPlaces:3,podiums:3,performances:4},
 {teamId:'a',teamName:'Альфа',firstPlaces:1,podiums:8,performances:9},
 {teamId:'v',teamName:'Вега',firstPlaces:3,podiums:6,performances:6},
];

test('teams display alphabetically by default, without imaginary podium ranks or points',()=>{
 const alphabetical=sortTeamStandings(teams,'NAME');
 assert.deepEqual(alphabetical.map(team=>team.teamName),['Альфа','Бета','Вега']);
 assert.deepEqual(teams.map(team=>team.teamId),['b','a','v'],'input is not mutated');
 assert.ok(alphabetical.every(team=>!Object.hasOwn(team,'points')&&!Object.hasOwn(team,'rank')));
});

test('explicit transparent user-selected metrics do not mix dB and m/s into a fake score',()=>{
 assert.deepEqual(sortTeamStandings(teams,'FIRST_PLACES').map(team=>team.teamName),['Бета','Вега','Альфа']);
 assert.deepEqual(sortTeamStandings(teams,'PODIUMS').map(team=>team.teamName),['Альфа','Вега','Бета']);
 assert.deepEqual(sortTeamStandings(teams,'PERFORMANCES').map(team=>team.teamName),['Альфа','Вега','Бета']);
});

test('public team directory hosts stage/season summaries and clearly marks partial data',async()=>{
 const [page,component,css,controller]=await Promise.all([
  readFile(new URL('../src/public/PublicTeamsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/teams/TeamStandings.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/teams/teams.css',import.meta.url),'utf8'),
  readFile(new URL('../../backend/src/teams/teams.controller.ts',import.meta.url),'utf8'),
 ]);
 assert.match(page,/<TeamStandings\s*\/>/);
 assert.match(component,/\/teams\/public\/standings/);
 assert.match(component,/Порядок команд по местам не утверждён/);
 assert.match(component,/data\.truncated/);
 assert.match(component,/Выступления по подтверждённой команде/);
 assert.match(component,/\/results\?stageId=/);
 assert.match(component,/\/participants\//);
 assert.match(css,/team-standings-list/);
 assert.match(controller,/@Get\('public\/standings'\)/);
});
