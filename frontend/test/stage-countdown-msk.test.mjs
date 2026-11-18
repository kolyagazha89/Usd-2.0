import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stageCountdownTarget,stageStartTimeLabel,nextPublishedStage} from '../src/public/premium-model.ts';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('countdown defaults to 10:00 Moscow even when persisted stage date is 12:00 UTC',()=>{
 const stage={id:'stage',date:'2026-11-28T12:00:00.000Z',status:'PUBLISHED'};
 const target=Date.parse('2026-11-28T07:00:00.000Z');
 assert.equal(stageCountdownTarget(stage),target);
 assert.equal(stageCountdownTarget({...stage,startTimeMsk:'10:00'}),target);
 assert.equal(stageStartTimeLabel(stage),'10:00 МСК');
 assert.equal(stageCountdownTarget(stage)-Date.parse('2026-11-28T06:00:00.000Z'),3600000);
 assert.equal(stageCountdownTarget(stage)-Date.parse('2026-11-28T07:00:00.000Z'),0);
});

test('time overrides affect countdown but never shift the advertised stage calendar day',()=>{
 const stage={id:'stage',date:'2026-11-28T12:00:00Z',status:'PUBLISHED',startTimeMsk:'14:30'};
 assert.equal(stageCountdownTarget(stage),Date.parse('2026-11-28T11:30:00.000Z'));
 assert.equal(stageStartTimeLabel(stage),'14:30 МСК');
 assert.equal(nextPublishedStage([stage],Date.parse('2026-11-28T19:00:00Z'))?.id,'stage');
 assert.equal(stageCountdownTarget({...stage,startTimeMsk:'00:00'}),Date.parse('2026-11-27T21:00:00.000Z'));
});

test('invalid stage dates and times cannot silently produce a misleading countdown',()=>{
 assert.equal(stageCountdownTarget({date:'bad'}),null);
 assert.equal(stageCountdownTarget({date:'2026-02-30T12:00:00Z'}),null);
 assert.equal(stageCountdownTarget({date:'2026-11-28T12:00:00Z',startTimeMsk:'25:00'}),null);
 assert.equal(stageCountdownTarget({date:'2026-11-28T12:00:00Z',startTimeMsk:'10:99'}),null);
});

test('homepage counts down to explicit Moscow start time, not raw ISO date',async()=>{
 const home=await read('../src/public/PremiumHome.tsx');
 assert.match(home,/stageCountdownTarget\(stage\)/);
 assert.match(home,/stageStartTimeLabel\(next\)/);
 assert.doesNotMatch(home,/new Date\(date\)\.getTime\(\)/);
});

test('editing a stage exposes explicit Moscow time, while date stays calendar-only',async()=>{
 const [competition,dashboard,dto,service,schema]=await Promise.all([
  read('../src/admin/CompetitionPages.tsx'),
  read('../src/admin/DashboardPage.tsx'),
  read('../../backend/src/stages/dto/stage.dto.ts'),
  read('../../backend/src/stages/stages.service.ts'),
  read('../../backend/prisma/schema.prisma'),
 ]);
 assert.match(competition,/name:'startTimeMsk',label:'Время начала \(МСК\)',type:'time'/);
 assert.match(competition,/startTimeMsk:/);
 assert.match(dashboard,/startTimeMsk:/);
 assert.match(dto,/startTimeMsk\?: string/);
 assert.match(service,/startTimeMsk:/);
 assert.match(schema,/startTimeMsk\s+String\s+@default\("10:00"\)/);
 const sql=await read('../../backend/prisma/migrations/20261118170000_stage_start_time_msk/migration.sql');
 assert.match(sql,/ALTER TABLE "Stage" ADD COLUMN "startTimeMsk" TEXT NOT NULL DEFAULT '10:00'/);
});
