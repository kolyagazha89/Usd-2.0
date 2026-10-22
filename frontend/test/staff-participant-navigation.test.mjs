import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {accountLanding,hasAdminPanelAccess} from '../src/navigation/accountAccess.ts';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');
const participant={id:'1',email:'a@example.invalid',role:'PARTICIPANT'};
const admin={...participant,role:'ADMIN'};
const judge={...participant,customRoleId:'judge',customRole:{id:'judge',name:'Судья',key:'judge',permissions:{results:['view','create']}}};

test('judge and admin can use personal cabinet and their distinct staff navigation',()=>{
 assert.equal(hasAdminPanelAccess(participant),false);
 assert.equal(hasAdminPanelAccess(admin),true);
 assert.equal(hasAdminPanelAccess(judge),true);
 assert.equal(hasAdminPanelAccess({...judge,customRole:{...judge.customRole,permissions:{results:['create']}}}),false);
 assert.equal(accountLanding(admin,'/participant?tab=cars'),'/participant?tab=cars');
 assert.equal(accountLanding(judge,'/participant/register?stageId=123'),'/participant/register?stageId=123');
 assert.equal(accountLanding(judge,'/admin/results'),'/admin/results');
 assert.equal(accountLanding(participant,'/admin/results'),'/participant');
 assert.equal(accountLanding(judge,'//example.com'),'/participant');
 assert.equal(accountLanding(admin,null,true),'/admin');
 assert.equal(accountLanding(judge,null),'/participant');
});

test('public staff, member and admin navigation coexist, with independent buttons',async()=>{
 const [app,premium,navigation,adminShell,styles]=await Promise.all([
  source('../src/App.tsx'),source('../src/public/PremiumShell.tsx'),
  source('../src/navigation/PublicNavigation.tsx'),source('../src/admin/AdminShell.tsx'),
  source('../src/public/premium-public.css'),
 ]);
 assert.match(premium,/const account=user\?'\/participant':'\/login'/);
 assert.match(premium,/adminPath=\{adminPath\}/);
 assert.match(navigation,/Админ-панель/);
 assert.match(premium,/usd-header-admin-shortcut/);
 assert.match(app,/path\)\|\|\(path\.startsWith\('\/admin'\)&&!hasAdminPanelAccess\(user\)\)/);
 assert.match(app,/onGoAdmin=\{\(\)=>go\('\/admin'\)\}/);
 assert.match(adminShell,/Вернуться на сайт/);
 assert.match(adminShell,/Мой кабинет/);
 assert.match(styles,/public-nav-admin/);
});

test('participant registration uses self-scoped routes even for custom staff roles',async()=>{
 const [app,controller]=await Promise.all([source('../src/App.tsx'),source('../../backend/src/registrations/registrations.controller.ts')]);
 assert.match(app,/apiPost\('\/registrations\/me'/);
 assert.ok(app.includes("apiDelete('/registrations/me/'+encodeURIComponent(r.id))"));
 assert.match(controller,/@Post\('me'\)/);
 assert.match(controller,/@Delete\('me\/:id'\)/);
 assert.match(controller,/participantId: request\.user\.participantId/);
 assert.match(controller,/this\.asParticipant\(request\)/);
});
