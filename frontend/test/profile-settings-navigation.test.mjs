import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');

test('account profile has four independent deep-linkable settings pages',async()=>{
 const [app,nav,styles,intro]=await Promise.all([
  read('../src/App.tsx'),read('../src/participant/ParticipantProfileNavigation.tsx'),
  read('../src/participant/profile-navigation.css'),read('../src/participant/ParticipantIntro.tsx')]);
 for(const key of ['personal','security','sessions','notifications']){
  assert.match(nav,new RegExp("id:'"+key+"' as const"));
 }
 assert.match(nav,/aria-label="Настройки профиля USD"/);
 assert.match(nav,/aria-current=\{section===id\?'page':undefined\}/);
 assert.match(nav,/href=\{'\/participant\?tab=profile&section='\+id\}/);
 assert.match(app,/const profileSection=participantProfileSection\(path\)/);
 assert.match(app,/ParticipantProfileNavigation section=\{profileSection\} go=\{go\}/);
 assert.match(app,/tab==='profile'&&profileSection==='personal'&&<section className="participant-section"/);
 assert.match(app,/profileSection==='security'\|\|profileSection==='sessions'/);
 assert.match(app,/section=\{profileSection\}/);
 assert.match(app,/tab==='profile'&&profileSection==='notifications'/);
 assert.match(app,/<PushPreferences\/>/);
 assert.match(app,/newsletter-settings/);
 assert.match(intro,/безопасность, устройства и уведомления/);
 assert.match(styles,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(styles,/@media\(max-width:1000px\)/);
 assert.match(styles,/@media\(max-width:480px\)/);
 assert.match(styles,/focus-visible/);
 assert.match(styles,/prefers-reduced-motion:reduce/);
});

test('security and sessions are independent without changing existing access protections',async()=>{
 const sec=await read('../src/ParticipantAccountSecurity.tsx');
 assert.match(sec,/section='all'/,'existing isolated workflows retain the full default regression fixture');
 assert.match(sec,/section\?:'security'\|'sessions'\|'all'/);
 assert.match(sec,/if\(section==='security'\)return;void loadSessions/,'no session disclosure call from password-only page');
 assert.match(sec,/section!=='sessions'&&<div className="account-security-grid"/);
 assert.match(sec,/section!=='security'&&<article className="account-security-card account-security-sessions"/);
 assert.match(sec,/await apiPost\('\/auth\/change-password'/);
 assert.match(sec,/await apiPost\('\/auth\/request-email-change'/);
 assert.match(sec,/await apiDelete\(target.kind==='all'\?'\/auth\/sessions'/);
 assert.match(sec,/confirmationButton/);
 assert.match(sec,/sessionRequest.current\+\+/);
});

test('all security browser action scenarios navigate to their own profile section',async()=>{
 const qa=await read('../../scripts/account-security-browser-qa.mjs');
 assert.match(qa,/section='security'/);
 assert.match(qa,/tab=profile&section='\+section/);
 assert.match(qa,/tab=profile&section=sessions/);
 assert.match(qa,/scenario\(width,'PARTICIPANT',true,false,true,'sessions'\)/);
 assert.match(qa,/scenario\(width,'PARTICIPANT',true,false,false,'sessions'\)/);
});
