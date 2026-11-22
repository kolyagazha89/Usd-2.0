import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stageCalendarDay,isPastStageCalendar,chooseInitialStage,markVenueStages} from '../src/admin/stage-calendar.ts';
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


test('the installed stage supports walk-ins with public registration closed and an elapsed date',()=>{
 const now=new Date('2026-11-29T12:00:00+05:00');
 const archived={id:'history',status:'PUBLISHED',date:'2026-11-28T10:00:00+05:00'};
 const installed={id:'lan',status:'PUBLISHED',date:'2026-11-27T10:00:00+05:00',registrationOpen:false};
 const next={id:'next',status:'PUBLISHED',date:'2026-11-30T10:00:00+05:00'};
 const [past,current,future]=markVenueStages([archived,installed,next],'lan');
 assert.equal(chooseInitialStage([past,current,future],now),'lan');
 assert.equal(stageIsReadOnly(current,now),false);
 assert.equal(stageIsReadOnly(installed,now),true);
 assert.equal(stageIsReadOnly(past,now),true);
 assert.equal(stageIsReadOnly(future,now),true);
 assert.equal(stageIsReadOnly({...current,status:'COMPLETED'},now),true);
 assert.equal(stageIsReadOnly({...current,status:'CANCELLED'},now),true);
 assert.throws(()=>markVenueStages([archived,installed,next],'incorrect'),/Активный этап не подтверждён/);
});

test('the three operator screens use the same server-confirmed LAN stage',async()=>{
 for(const name of ['EventDayPage','RegistrationsPage','InspectionsPage']){
  const source=await readFile(new URL('../src/admin/'+name+'.tsx',import.meta.url),'utf8');
  assert.match(source,/loadOperationalStages(?:<[^>]+>)?\(/);
 }
 const source=await readFile(new URL('../src/admin/operational-stages.ts',import.meta.url),'utf8');
 assert.match(source,/__USD_VENUE_MODE__/);
 assert.match(source,/\/results\/venue-live/);
 assert.match(source,/markVenueStages\(items,live\?\.stage\?\.id/);
});
