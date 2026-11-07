import test from 'node:test';
import assert from 'node:assert/strict';
import {filterTeamStages, teamStageSeasons, summarizeTeamStages} from '../src/teams/team-stage-filters.ts';
const stages=[
 {id:'s26',date:'2026-07-12T12:00:00.000Z',performances:[
  {id:'r1',direction:'SPL',participant:{id:'p1'},place:1},
  {id:'r2',direction:'BFSPL',participant:{id:'p1'},place:3},
  {id:'r3',direction:'SPL',participant:{id:'p2'},place:null}]},
 {id:'s25',date:'2025-07-12T12:00:00.000Z',performances:[
  {id:'r4',direction:'SPL',participant:{id:'p3'},place:2}]},
];
test('season and direction selection filters published stages without altering original data',()=>{
 const selected=filterTeamStages(stages,{season:'2026',direction:'SPL'});
 assert.deepEqual(selected.map(x=>[x.id,x.performances.map(y=>y.id)]),[['s26',['r1','r3']]]);
 assert.equal(stages[0].performances.length,3);
 assert.deepEqual(teamStageSeasons(stages),['2026','2025']);
});
test('stage selection composes with season and direction, empty matches do not invent rows',()=>{
 assert.deepEqual(filterTeamStages(stages,{stageId:'s25',direction:'SPL'}).map(s=>s.id),['s25']);
 assert.deepEqual(filterTeamStages(stages,{stageId:'s25',season:'2026'}),[]);
});
test('filtered summary counts each person once and counts only valid podiums',()=>{
 assert.deepEqual(summarizeTeamStages(filterTeamStages(stages,{season:'2026'})),{stages:1,performances:3,participants:2,podiums:2,firstPlaces:1});
 assert.deepEqual(summarizeTeamStages([]),{stages:0,performances:0,participants:0,podiums:0,firstPlaces:0});
});
