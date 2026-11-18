import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nextPublishedStage,stageStartTimestamp,stageCountdownSeconds,stageStartLabel} from '../src/public/premium-model.ts';

test('published stages default to 10:00 Moscow regardless of historical noon UTC storage',()=>{
 const stage={date:'2026-11-28T12:00:00.000Z'};
 const start=Date.parse('2026-11-28T07:00:00.000Z');
 assert.equal(stageStartTimestamp(stage),start);
 assert.equal(stageStartTimestamp({...stage,startTimeMsk:null}),start);
 assert.equal(stageStartTimestamp({...stage,startTimeMsk:'10:00'}),start);
 assert.equal(stageStartLabel(stage),'10:00 МСК');
 assert.equal(stageCountdownSeconds(stage,start-1500),1);
 assert.equal(stageCountdownSeconds(stage,start+2500),0);
});

test('a nonstandard start time can be configured per stage without changing its calendar date',()=>{
 const stage={date:'2026-11-28T12:00:00.000Z',startTimeMsk:'12:45'};
 assert.equal(stageStartTimestamp(stage),Date.parse('2026-11-28T09:45:00.000Z'));
 assert.equal(stageStartLabel(stage),'12:45 МСК');
 assert.equal(stageStartTimestamp({...stage,startTimeMsk:'25:99'}),null);
 assert.equal(stageStartTimestamp({date:'invalid',startTimeMsk:'10:00'}),null);
});

test('homepage selects next stage on Moscow calendar day, independent of visitor timezone',()=>{
 const stages=[
  {id:'day28',date:'2026-11-28T12:00:00Z',status:'PUBLISHED'},
  {id:'day29',date:'2026-11-29T12:00:00Z',status:'PUBLISHED'},
 ];
 assert.equal(nextPublishedStage(stages,Date.parse('2026-11-27T21:30:00Z'))?.id,'day28');
 assert.equal(nextPublishedStage(stages,Date.parse('2026-11-28T21:30:00Z'))?.id,'day29');
});

test('homepage counter uses per-stage Moscow start and clearly labels its timezone',async()=>{
 const source=await readFile(new URL('../src/public/PremiumHome.tsx',import.meta.url),'utf8');
 assert.match(source,/stageStartTimestamp\(/);
 assert.match(source,/stageStartLabel\(/);
 assert.match(source,/startTimeMsk=\{next\.startTimeMsk\}/);
});

test('stage editor exposes an editable start time defaulting to 10:00 MSK',async()=>{
 const [competition,form,quick,service,schema]=await Promise.all([
  readFile(new URL('../src/admin/CompetitionPages.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/FormComponents.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/DashboardPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../../backend/src/stages/stages.service.ts',import.meta.url),'utf8'),
  readFile(new URL('../../backend/prisma/schema.prisma',import.meta.url),'utf8'),
 ]);
 assert.match(competition,/name:'startTimeMsk'/);
 assert.match(competition,/Время начала \(МСК\)/);
 assert.match(form,/startTimeMsk/);
 assert.match(quick,/startTimeMsk/);
 assert.match(service,/startTimeMsk/);
 assert.match(schema,/startTimeMsk\s+String\?/);
});
