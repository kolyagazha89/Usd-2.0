import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {currentCarAudioComponents,isCarRegisteredForStage,isDirectionConfigured,preferredUpcomingStage,requiredDirectionsForRegistration,upcomingStages} from '../src/participant/member-readiness.ts';

const row=(direction,type='MIDBASS',quantity=1)=>({direction,type,brand:' USD ',model:'Model 1',quantity});

test('direction readiness requires a real, positive-quantity component',()=>{
 assert.equal(isDirectionConfigured(undefined,'SUB'),false);
 assert.equal(isDirectionConfigured([],'SUB'),false);
 assert.equal(isDirectionConfigured([row('SUB','MIDBASS')],'SUB'),false);
 assert.equal(isDirectionConfigured([row('SUB','SUBWOOFER',0)],'SUB'),false);
 assert.equal(isDirectionConfigured([row('SUB','SUBWOOFER',-2)],'SUB'),false);
 assert.equal(isDirectionConfigured([row('SUB','SUBWOOFER',0.5)],'SUB'),false);
 assert.equal(isDirectionConfigured([row('SUB','SUBWOOFER','1.5')],'SUB'),false);
 assert.equal(isDirectionConfigured([row('SUB','SUBWOOFER',Number.NaN)],'SUB'),false);
 assert.equal(isDirectionConfigured([{...row('SUB','SUBWOOFER'),model:' '}],'SUB'),false);
 assert.equal(isDirectionConfigured([row('SUB','SUBWOOFER',2)],'SUB'),true);
 assert.equal(isDirectionConfigured([row('FRONT')],'FRONT'),true);
 assert.equal(isDirectionConfigured([row('REAR')],'FRONT'),false);
});

test('garage uses the active configuration current version, not another version or car',()=>{
 const car={configurations:[
  {isActive:false,currentVersion:3,versions:[{version:3,audioComponents:[row('SUB','SUBWOOFER')]}]},
  {isActive:true,currentVersion:2,versions:[
   {version:1,audioComponents:[row('SUB','SUBWOOFER')]},
   {version:2,audioComponents:[row('FRONT')]},
  ]},
 ]};
 const components=currentCarAudioComponents(car);
 assert.equal(isDirectionConfigured(components,'SUB'),false);
 assert.equal(isDirectionConfigured(components,'FRONT'),true);
 assert.equal(currentCarAudioComponents({configurations:[]}),undefined);
 assert.equal(currentCarAudioComponents({configurations:[{isActive:true,currentVersion:99,versions:[{version:1,audioComponents:[row('SUB','SUBWOOFER')]}]}]}),undefined,'stale currentVersion must not mark old equipment as ready');
 assert.deepEqual(currentCarAudioComponents({configurations:[{isActive:true,versions:[{version:1,audioComponents:[row('FRONT')]}]}]}),[row('FRONT')],'legacy configurations without a pointer remain readable');
});

test('a registration on another vehicle or stage never completes selected vehicle readiness',()=>{
 const registrations=[
  {carId:'car-a',stageId:'stage-1',status:'ACTIVE'},
  {car:{id:'car-b'},stage:{id:'stage-2'},status:'ACTIVE'},
  {carId:'car-b',stageId:'stage-1',status:'CANCELLED'},
 ];
 assert.equal(isCarRegisteredForStage(registrations,'car-a','stage-1'),true);
 assert.equal(isCarRegisteredForStage(registrations,'car-b','stage-1'),false);
 assert.equal(isCarRegisteredForStage(registrations,'car-b','stage-2'),true);
 assert.equal(isCarRegisteredForStage(registrations,'car-b','stage-3'),false);
 assert.equal(isCarRegisteredForStage(registrations,undefined,'stage-1'),false);
});

test('upcoming events exclude past stages even when registration remains open',()=>{
 const now=new Date(2026,9,27,23,45);
 const stages=[
  {id:'past-open',date:'2026-10-20T09:00:00.000Z',registrationOpen:true},
  {id:'future',date:'2026-11-01T09:00:00.000Z',registrationOpen:false},
  {id:'today',date:'2026-10-27T00:00:00.000Z',registrationOpen:false},
  {id:'tomorrow',date:'2026-10-28',registrationOpen:true},
  {id:'deleted',date:'2026-10-27T09:00:00.000Z',isDeleted:true},
  {id:'draft',date:'2026-10-27T09:00:00.000Z',status:'DRAFT',registrationOpen:true},
  {id:'cancelled',date:'2026-10-27T09:00:00.000Z',status:'CANCELLED'},
  {id:'completed-future',date:'2026-11-01T09:00:00.000Z',status:'COMPLETED'},
  {id:'bad-date',date:'not-a-date',registrationOpen:true},
  {id:'no-date',registrationOpen:true},
 ];
 assert.deepEqual(upcomingStages(stages,now).map(stage=>stage.id),['today','tomorrow','future']);
 assert.equal(stages[0].id,'past-open','must not mutate the API array');
});

test('garage selects its upcoming stage through the shared calendar-day filter',async()=>{
 const dashboard=await readFile(new URL('../src/participant/MemberDashboard.tsx',import.meta.url),'utf8');
 assert.match(dashboard,/const upcoming=upcomingStages\(stages\)/);
 assert.doesNotMatch(dashboard,/registrationOpen\|\|new Date\(s\.date/);
});


test('the garage features the selected car\'s next registered event without hiding earlier events',()=>{
 const stages=[{id:'early'},{id:'registered'},{id:'later'}];
 const registrations=[
  {carId:'car-a',stageId:'early',status:'CANCELLED'},
  {carId:'car-a',stageId:'registered',status:'ACTIVE'},
  {carId:'car-b',stageId:'early',status:'ACTIVE'},
 ];
 assert.equal(preferredUpcomingStage(stages,registrations,'car-a')?.id,'registered');
 assert.equal(preferredUpcomingStage(stages,registrations,'car-b')?.id,'early');
 assert.equal(preferredUpcomingStage(stages,registrations,'car-c')?.id,'early');
 assert.equal(preferredUpcomingStage(stages,registrations,undefined)?.id,'early');
 assert.equal(preferredUpcomingStage([],registrations,'car-a'),undefined);
 assert.deepEqual(stages.map(stage=>stage.id),['early','registered','later'],'the input calendar must stay intact');
});

test('garage renders all other upcoming events when a registered event is featured',async()=>{
 const dashboard=await readFile(new URL('../src/participant/MemberDashboard.tsx',import.meta.url),'utf8');
 assert.match(dashboard,/preferredUpcomingStage\(upcoming,registrations,car\?\.id\)/);
 assert.match(dashboard,/otherStages=upcoming\.filter\(item=>item\.id!==stage\?\.id\)/);
 assert.match(dashboard,/otherStages\.slice\(0,3\)/);
});

test('garage checks all required audio directions for registered competition classes',()=>{
 const registration={classes:[
  {class:{name:'Limited 2.0',direction:{name:'SPL'}}},
  {class:{name:'Gate 1-6',direction:{name:'BFSPL'}}},
  {class:{name:'BDW SPL',direction:{name:'BDW SPL'}}},
 ]};
 assert.deepEqual(requiredDirectionsForRegistration(registration),['SUB','FRONT','REAR']);
 assert.deepEqual(requiredDirectionsForRegistration({classes:[{class:{name:'BassRace 139.9'}}]}),['SUB']);
 assert.deepEqual(requiredDirectionsForRegistration({classes:[{class:{name:'Storm Wall'}}]}),['SUB']);
 assert.deepEqual(requiredDirectionsForRegistration({classes:[{class:{name:'Gate 1-6',direction:{name:'BFSPL'}}}]}),['FRONT']);
 assert.deepEqual(requiredDirectionsForRegistration({classes:[{class:{name:'NoLim',direction:{name:'SPL'}}}]}),['SUB']);
 assert.deepEqual(requiredDirectionsForRegistration({classes:[{class:{name:'Wicket 6-10',direction:{name:'BFSPL'}}}]}),['FRONT']);
 assert.deepEqual(requiredDirectionsForRegistration({classes:[{class:{name:'Custom class'}}]}),[]);
 assert.deepEqual(requiredDirectionsForRegistration(undefined),[]);
});

test('garage readiness requires the equipment for registered classes, not any unrelated speaker',async()=>{
 const dashboard=await readFile(new URL('../src/participant/MemberDashboard.tsx',import.meta.url),'utf8');
 assert.match(dashboard,/requiredDirectionsForRegistration\(entry\)\.filter\(direction=>!filled\(direction\)\)/);
 assert.match(dashboard,/done:equipmentReady/);
 assert.match(dashboard,/missingRequiredDirections\.length\?'Для ваших классов заполните:/);
});
