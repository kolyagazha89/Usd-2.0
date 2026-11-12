import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {blockingDisqualification,disqualificationScopeLabel,disqualificationBlockMessage} from '../src/participant/disqualification-policy.ts';

const format={id:'format',scope:'FORMAT',stageId:null,seasonId:null,reason:'Нарушение регламента',status:'ACTIVE'};
const season={id:'season',scope:'SEASON',stageId:null,seasonId:'season-2026',reason:'Решение сезона',status:'ACTIVE'};
const stage={id:'stage',scope:'STAGE',stageId:'stage-1',seasonId:null,reason:'Решение этапа',status:'ACTIVE'};

test('format disqualification blocks every stage regardless of season',()=>{
 assert.equal(blockingDisqualification([format],{id:'stage-1',seasonId:'season-2026'})?.id,'format');
 assert.equal(blockingDisqualification([format],{id:'stage-2',seasonId:'season-2027'})?.id,'format');
 assert.match(disqualificationBlockMessage(format),/регистрация запрещена/i);
});

test('season and stage bans affect only the matching event, prioritizing the widest scope',()=>{
 assert.equal(blockingDisqualification([stage,season],{id:'stage-1',seasonId:'season-2026'})?.id,'season');
 assert.equal(blockingDisqualification([stage],{id:'stage-2',seasonId:'season-2026'}),null);
 assert.equal(blockingDisqualification([season],{id:'stage-1',seasonId:'season-2027'}),null);
 assert.equal(blockingDisqualification([format,season,stage],{id:'stage-1',seasonId:'season-2026'})?.id,'format');
 assert.equal(blockingDisqualification([{...format,status:'REVOKED'}],{id:'stage-1',seasonId:'season-2026'}),null);
 assert.equal(blockingDisqualification([format],null),null);
});

test('profile labels explain the actual extent rather than treating a stage ban as permanent',()=>{
 assert.match(disqualificationScopeLabel(format),/формат/i);
 assert.match(disqualificationScopeLabel(season),/сезон/i);
 assert.match(disqualificationScopeLabel(stage),/этап/i);
 assert.match(disqualificationBlockMessage(stage),/регистрация запрещена/i);
});

test('participant portal loads own bans before offering the wizard and displays them in profile',async()=>{
 const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
 const dashboard=await readFile(new URL('../src/participant/MemberDashboard.tsx',import.meta.url),'utf8');
 assert.match(app,/apiGet<any>\('\/disqualifications\/me'\)/);
 assert.match(app,/blockingDisqualification\(activeDisqualifications,stage\)/);
 assert.match(app,/member-disqualification-alert/);
 assert.match(app,/registrationBlockForStage\(registerStage\)/);
 assert.match(app,/registrationBlockForStage\(s\)/);
 assert.match(dashboard,/registrationBlockForStage\(stage\)/);
 assert.match(dashboard,/disabled=\{!entry&&Boolean\(stageBlock\)\}/);
});
