import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=file=>readFile(new URL(file,import.meta.url),'utf8');

test('public teams directory includes a cross-team stage and season comparison, without fake points',async()=>{
 const [page,comparison]=await Promise.all([
  source('../src/public/PublicTeamsPage.tsx'),
  source('../src/teams/TeamStandings.tsx'),
 ]);
 assert.match(page,/import TeamStandings from '\.\.\/teams\/TeamStandings'/);
 assert.match(page,/<TeamStandings\s*\/>/);
 assert.match(comparison,/\/teams\/public\/standings\?/);
 assert.match(comparison,/apiGet\('\\/seasons'\)/);
 assert.match(comparison,/\/stages\/public/);
 assert.match(comparison,/Выберите сезон|Сезон/);
 assert.match(comparison,/Выберите этап|Этап/);
 assert.match(comparison,/aria-expanded=\{/);
 assert.match(comparison,/\/participants\//);
 assert.match(comparison,/\/results\?stageId=/);
 assert.doesNotMatch(comparison,/командных очков|начисляем очки|баллов за место/);
});

test('standings gives published result provenance and warns on truncated response',async()=>{
 const comparison=await source('../src/teams/TeamStandings.tsx');
 assert.match(comparison,/data\.truncated/);
 assert.match(comparison,/первой успешной инспекции|первой инспекции/);
 assert.match(comparison,/дБ\/м\/с|дБ и м\/с/);
 assert.match(comparison,/role="status"/);
 assert.match(comparison,/role="alert"/);
});

test('mobile and desktop team comparison have responsive dark public styling',async()=>{
 const css=await source('../src/teams/teams.css');
 assert.match(css,/\.team-standings\s*\{/);
 assert.match(css,/\.team-standings-list\s*\{/);
 assert.match(css,/@media\(max-width:600px\)[\s\S]*\.team-standings/);
});
