import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=async name=>readFile(new URL(name,import.meta.url),'utf8');

test('all participant and account routes use the isolated premium public theme',async()=>{
 const [app,account,main,css]=await Promise.all([
  source('../src/App.tsx'),
  source('../src/AccountActionPage.tsx'),
  source('../src/main.tsx'),
  source('../src/public/premium-member.css')
 ]);
 const participantRoots=app.match(/className="participant-portal(?: [^"]*)?"/g)??[];
 assert.ok(participantRoots.length>=7,'expected all participant route variants');
 for(const root of participantRoots)assert.match(root,/\busd-member\b/,root);
 assert.match(app,/className="profile-match-page usd-member"/);
 assert.match(app,/className="login-page usd-auth"/);
 assert.match(app,/className="login-page usd-auth usd-auth-simple"/);
 assert.match(account,/className="login-page usd-auth usd-auth-simple"/);
 const lastCss=main.trim().split('\n').filter(line=>/^import .*\.css';$/.test(line)).at(-1);
 assert.equal(lastCss,"import './public/premium-configurator.css';",'participant configurator styling must follow base member theme');
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
 assert.match(app,/<MemberDashboard cars=\{cars\} registrations=\{registrations\}/);
 assert.match(dashboard,/car\.photoUrl/);
 assert.match(dashboard,/audioComponents/);
 assert.match(dashboard,/registrations\.filter/);
 assert.match(editor,/configurations-page-shell"\+\(admin\?" admin-configurations-shell":" usd-member"\)/);
 assert.match(editor,/usd-member/);
 assert.match(editor,/aria-label="Добавить оборудование"/);
 assert.match(editor,/activeModels\(picker\.kind\)/);
 assert.match(editor,/const validateCatalog=/);
 assert.match(editor,/if\(!validateCatalog\(\)\)return/);
 assert.match(editor,/setRequestOpen\(true\)/);
 assert.match(css,/member-config-picker-overlay/);
 assert.match(css,/member-release-dashboard/);
});

test('box configuration is versioned and explicit save-as-new keeps older revisions',async()=>{
 const [editor,css]=await Promise.all([
  source('../src/admin/ConfigurationsPage.tsx'),
  source('../src/public/premium-configurator.css')
 ]);
 assert.match(editor,/const BOX_LINE=/);
 assert.match(editor,/withoutBoxLine\(initial\.additionalDescription/);
 assert.match(editor,/boxLine\+v\.additionalDescription/);
 assert.match(editor,/data-member-view=\{admin\?undefined:activeView\}/);
 assert.match(editor,/className="member-config-box"/);
 assert.match(editor,/Сохранить новую версию/);
 assert.match(editor,/if\(saveAsNew\)await apiPost/);
 assert.match(editor,/member-config-timeline/);
 assert.match(css,/data-member-view="BOX"/);
 assert.match(css,/member-config-timeline-list/);
});
