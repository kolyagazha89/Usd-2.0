import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=async name=>readFile(new URL(name,import.meta.url),'utf8');

test('all participant and account routes use the isolated premium public theme',async()=>{
 const [app,account,main,css,onboarding]=await Promise.all([
  source('../src/App.tsx'),
  source('../src/AccountActionPage.tsx'),
  source('../src/main.tsx'),
  source('../src/public/premium-member.css'),
  source('../src/participant/FirstLoginOnboarding.tsx')
 ]);
 const participantRoots=app.match(/className="participant-portal(?: [^"]*)?"/g)??[];
 assert.ok(participantRoots.length>=7,'expected all participant route variants');
 for(const root of participantRoots)assert.match(root,/\busd-member\b/,root);
 assert.match(app,/<FirstLoginOnboarding/);
 assert.match(onboarding,/className="profile-match-page usd-member"/);
 assert.match(app,/className="login-page usd-auth"/);
 assert.match(app,/className="login-page usd-auth usd-auth-simple"/);
 assert.match(account,/className="login-page usd-auth usd-auth-simple"/);
 const cssImports=main.trim().split('\n').filter(line=>/^import .*\.css';$/.test(line));
 assert.equal(cssImports.at(-2),"import './participant/member-experience.css';",'participant experience styling must follow base member and configurator themes');
 assert.equal(cssImports.at(-1),"import './dark-velocity-sitewide.css';",'Dark Velocity must be the final visual layer');
 assert.ok(main.indexOf("import './public/premium-member.css'")<main.indexOf("import './public/premium-configurator.css'"));
 assert.match(css,/body \.usd-member \.participant-tabs/);
 assert.match(css,/body \.usd-member \.config-direction-workspace/);
 assert.match(css,/body \.usd-member \.participant-stats/);
 assert.match(css,/body \.usd-auth-story/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/font:500 16px/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/body \.app-shell|\.admin-configurations-shell\s*\{/,'do not reskin admin');
});

test('original public logo stays a first-party asset and no public USD 2.0 name is introduced',async()=>{
 const app=await source('../src/App.tsx');
 assert.match(app,/src="\/usd\/usd-original.png"/);
 assert.doesNotMatch(app,/USD 2\.0/);
});

test('participant configurations implement separate released layout without changing admin editor',async()=>{
 const [editor,css]=await Promise.all([source('../src/admin/ConfigurationsPage.tsx'),source('../src/public/premium-configurator.css')]);
 for(const key of ["'SUB'","'FRONT'","'REAR'","'POWER'","'NOTES'","'SETUP'"])assert.ok(editor.includes(key),key);
 assert.match(editor,/data-member-view=\{admin\?undefined:activeView\}/);
 assert.match(editor,/member-config-vehicle/);
 assert.match(editor,/member-config-directions/);
 assert.match(editor,/member-config-actions-sheet/);
 assert.match(editor,/member-config-readiness/);
 assert.match(editor,/member-config-power/);
 assert.match(editor,/member-config-description/);
 assert.match(css,/data-member-view="FRONT"/);
 assert.match(css,/data-member-view="SUB"/);
 assert.match(css,/data-member-view="REAR"/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/\.admin-configurations-shell \.member-config-description/);
 assert.doesNotMatch(css,/\bUSD 2\.0\b/);
});

test('release member dashboard and catalog-locked add equipment screen remain wired',async()=>{
 const [app,dashboard,editor,css]=await Promise.all([
  source('../src/App.tsx'),source('../src/participant/MemberDashboard.tsx'),
  source('../src/admin/ConfigurationsPage.tsx'),source('../src/public/premium-configurator.css')
 ]);
 assert.match(app,/MemberDashboard from '\.\/participant\/MemberDashboard'/);
 assert.match(app,/<MemberDashboard\b/);
 assert.match(dashboard,/car\?\.photoUrl/);
 assert.match(dashboard,/currentCarAudioComponents\(car\)/,'member garage must use current version audio summary');
 assert.match(dashboard,/registrations\.filter/);
 assert.match(editor,/configurations-page-shell"\+\(admin\?" admin-configurations-shell":" usd-member"\)/);
 assert.match(editor,/usd-member/);
 assert.match(editor,/aria-label="Добавить оборудование"/);
 assert.match(editor,/activeModels\(picker\.kind,picker\.type\)/);
 assert.match(editor,/const validateCatalog=/);
 assert.match(editor,/if\(!validateCatalog\(\)\)return/);
 assert.match(editor,/setRequestOpen\(true\)/);
 assert.match(css,/member-config-picker-overlay/);
 assert.match(css,/member-release-dashboard/);
});

test('box configuration is versioned and saves preserve earlier revisions',async()=>{
 const [editor,css,boxParameters]=await Promise.all([
  source('../src/admin/ConfigurationsPage.tsx'),
  source('../src/public/premium-configurator.css'),
  source('../src/participant/box-parameters.ts')
 ]);
 assert.match(boxParameters,/const BOX_LINE=/);
 assert.match(editor,/boxFromDescription,withoutBoxLine,validateBoxParameters,isBoxConfigured,formatBoxLine/);
 assert.match(editor,/withoutBoxLine\(initial\.additionalDescription/);
 assert.match(editor,/boxLine\+v\.additionalDescription/);
 assert.match(editor,/data-member-view=\{admin\?undefined:activeView\}/);
 assert.match(editor,/className="member-config-box"/);
 assert.match(editor,/Сохранить новую версию/);
 assert.match(editor,/else await apiPut\('\/configurations\/'\+configuration\.id,body\)/);
 assert.doesNotMatch(editor,/if\(saveAsNew\)await apiPost/);
 assert.match(editor,/member-config-timeline/);
 assert.match(css,/data-member-view="BOX"/);
 assert.match(css,/member-config-timeline-list/);
});


test('member garage receives equipment summary from the authenticated cars endpoint',async()=>{
 const [service,dashboard,journey,readiness]=await Promise.all([
  source('../../backend/src/participants/participants.service.ts'),
  source('../src/participant/MemberDashboard.tsx'),
  source('../src/participant/ParticipantJourney.tsx'),
  source('../src/participant/member-readiness.ts')
 ]);
 const start=service.indexOf('private async findCarsInternal(');
 const end=service.indexOf('// =========================================================',start);
 assert.ok(start>=0&&end>start,'authenticated car listing must exist');
 const carsQuery=service.slice(start,end);
 assert.match(carsQuery,/audioComponents:\s*\{\s*select:\s*\{/,'cars endpoint must include current audio summary');
 for(const key of ['brand','model','quantity','type','direction'])assert.match(carsQuery,new RegExp(key+': true'),'missing '+key+' in car equipment summary');
 assert.match(readiness,/Number\(item\.quantity\)/,'zero-quantity equipment must not count as ready');
 assert.match(readiness,/quantity>0/,'only positive quantities count as ready');
 assert.match(dashboard,/equipmentReady=hasUsableEquipment&&missingRequiredDirections\.length===0/,'equipment readiness must require a non-empty build and every direction required by registered classes');
 assert.match(dashboard,/done:equipmentReady/,'saved empty versions must not complete the equipment step');
 assert.match(dashboard,/<ParticipantJourney car=\{car\} stage=\{stage\}/,'onboarding must use the selected car and stage');
 assert.match(journey,/isCarRegisteredForStage\(registrations,car\?\.id,stage\?\.id\)/,'other cars must not complete onboarding');
});
