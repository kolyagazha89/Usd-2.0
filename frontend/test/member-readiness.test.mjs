import test from 'node:test';
import assert from 'node:assert/strict';
import {currentCarAudioComponents,isCarRegisteredForStage,isDirectionConfigured} from '../src/participant/member-readiness.ts';

const row=(direction,type='MIDBASS',quantity=1)=>({direction,type,brand:' USD ',model:'Model 1',quantity});

test('direction readiness requires a real, positive-quantity component',()=>{
 assert.equal(isDirectionConfigured(undefined,'SUB'),false);
 assert.equal(isDirectionConfigured([],'SUB'),false);
 assert.equal(isDirectionConfigured([row('SUB','MIDBASS')],'SUB'),false);
 assert.equal(isDirectionConfigured([row('SUB','SUBWOOFER',0)],'SUB'),false);
 assert.equal(isDirectionConfigured([row('SUB','SUBWOOFER',-2)],'SUB'),false);
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
