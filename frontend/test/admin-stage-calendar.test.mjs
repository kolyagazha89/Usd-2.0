import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stageCalendarDay,isPastStageCalendar,chooseInitialStage} from '../src/admin/stage-calendar.ts';
import {stageIsReadOnly} from '../src/admin/event-day-model.ts';

test('USD stage calendar day is stable across clients in other time zones',()=>{
 const ekbMidnight=new Date('2026-11-28T00:30:00+05:00');
 assert.equal(stageCalendarDay(ekbMidnight),'2026-11-28');
 assert.equal(stageCalendarDay('2026-11-27T23:30:00+05:00'),'2026-11-27');
 assert.equal(stageCalendarDay('2026-11-28'),'2026-11-28');
 assert.equal(stageCalendarDay('invalid'),null);
});

test('yesterday is already read-only just after Yekaterinburg midnight',()=>{
 const now=new Date('2026-11-28T00:30:00+05:00');
 const yesterday={date:'2026-11-27T12:00:00+05:00',status:'PUBLISHED'};
 const today={date:'2026-11-28T09:00:00+05:00',status:'PUBLISHED'};
 assert.equal(isPastStageCalendar(yesterday,now),true);
 assert.equal(stageIsReadOnly(yesterday,now),true);
 assert.equal(isPastStageCalendar(today,now),false);
 assert.equal(stageIsReadOnly(today,now),false);
 assert.equal(isPastStageCalendar({...today,status:'COMPLETED'},now),true);
 assert.equal(isPastStageCalendar({...today,status:'CANCELLED'},now),true);
 assert.equal(isPastStageCalendar({status:'PUBLISHED'},now),false);
 assert.equal(stageIsReadOnly(undefined,now),true);
});

test('today at 00:00 remains selectable even if its timestamp precedes UTC midnight',()=>{
 const now=new Date('2026-11-28T00:30:00+05:00');
 const stages=[
  {id:'old',date:'2026-11-27T10:00:00+05:00',status:'COMPLETED'},
  {id:'today',date:'2026-11-28T00:00:00+05:00',status:'PUBLISHED'},
  {id:'next',date:'2026-12-01T10:00:00+05:00',status:'PUBLISHED'},
 ];
 assert.equal(chooseInitialStage(stages,now),'today');
 assert.equal(chooseInitialStage(stages.filter(stage=>stage.id!=='today'),now),'next');
 assert.equal(chooseInitialStage(stages.filter(stage=>stage.id==='old'),now),'old');
 assert.equal(chooseInitialStage([{...stages[1],status:'CANCELLED'}],now),'today');
});

test('registration, inspection and event-day screens share one calendar policy',async()=>{
 const files=await Promise.all([
  readFile(new URL('../src/admin/RegistrationsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/InspectionsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/EventDayPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/event-day-model.ts',import.meta.url),'utf8'),
 ]);
 assert.match(files[0],/from ['"]\.\/stage-calendar['"]/);
 assert.match(files[1],/from ['"]\.\/stage-calendar['"]/);
 assert.match(files[2],/from ['"]\.\/stage-calendar['"]/);
 assert.match(files[3],/from ['"]\.\/stage-calendar\.ts['"]/);
 assert.doesNotMatch(files[0],/setHours\(0,0,0,0\)/);
 assert.doesNotMatch(files[1],/setHours\(0,0,0,0\)/);
 assert.doesNotMatch(files[2],/setHours\(0,0,0,0\)/);
 assert.doesNotMatch(files[3],/setHours\(0,0,0,0\)/);
});
