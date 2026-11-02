import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL(p,import.meta.url),'utf8');

test('registration and inspection share one stage-aware command desk with preserved stage links',async()=>{
 const [nav,registrations,inspections]=await Promise.all([
  read('../src/admin/EventOperationsNavigation.tsx'),
  read('../src/admin/RegistrationsPage.tsx'),
  read('../src/admin/InspectionsPage.tsx'),
 ]);
 assert.match(nav,/aria-label="Рабочие разделы этапа"/);
 assert.match(nav,/step\.path\+'\?stageId='\+encodeURIComponent\(stageId\)/);
 assert.match(nav,/disabled=\{!stageId\}/,'no navigation without selecting a stage');
 assert.match(nav,/aria-current=\{active\?'page':undefined\}/);
 assert.match(nav,/if\(!active&&stageId\)go/,'current section does not trigger navigation');
 assert.match(nav,/Этап/);
 assert.match(registrations,/EventOperationsNavigation current="registrations"/);
 assert.match(inspections,/EventOperationsNavigation current="inspections"/);
 assert.match(registrations,/stageName=\{selectedStage\?\.name\}/);
 assert.match(inspections,/stageName=\{stages\.find\(s=>s\.id===stageId\)\?\.name\}/);
 assert.match(inspections,/readOnly=\{period==='PAST'\}/);
});

test('both operational lists have independently reachable detail actions and loading semantics',async()=>{
 const [registrations,inspections]=await Promise.all([
  read('../src/admin/RegistrationsPage.tsx'),
  read('../src/admin/InspectionsPage.tsx'),
 ]);
 for(const s of [registrations,inspections]){
  assert.match(s,/className="panel table-wrap event-ops-results" aria-busy=\{loading\}/);
  assert.match(s,/className="data-table" aria-label="/);
  assert.match(s,/event-ops-open/);
 }
 assert.match(registrations,/aria-label=\{"Подробнее о регистрации: "/);
 assert.match(registrations,/onClick=\{\(\)=>setDetail\(r\)\}/);
 assert.match(registrations,/cancelId===r\.id/,'on-site cancel still requires a second confirmation');
 assert.match(inspections,/onClick=\{onOpen\}/);
 assert.match(inspections,/Итоговый список допущенных доступен ниже/);
 assert.doesNotMatch(inspections,/готов к выгрузке|text\/csv|\.csv/);
 assert.match(inspections,/classIds\.length>5/,'maximum five classes remains guarded');
 assert.match(inspections,/!notes\.trim\(\)/,'failed inspection requires a reason');
});

test('light premium event desk fills admin pane without changing global or public layout',async()=>{
 const [css,entry,layout]=await Promise.all([
  read('../src/admin/admin-shell-layout.css'),
  read('../src/main.tsx'),
  read('../src/ui-consistency.css'),
 ]);
 assert.match(css,/USD event-day command desk/);
 for(const cls of ['event-ops-workflow','event-ops-workflow-context','event-ops-workflow-steps','event-ops-workflow-step','event-ops-results','event-ops-open','event-ops-inspection-metrics','resource-editor-page']){
  assert.ok(css.includes('.'+cls),cls+' styling missing');
 }
 assert.match(css,/\.event-ops-page\s*\{\s*inline-size:100%!important;/);
 assert.match(css,/\.event-ops-results\s*\{[\s\S]*?scrollbar-color:#bcbfc8 transparent/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/overflow-x:visible!important/);
 assert.match(css,/grid-template-columns:minmax\(72px,34%\) minmax\(0,1fr\)/);
 assert.match(css,/font-size:16px/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.event-ops-workflow-step:focus-visible/);
 assert.match(css,/border-bottom-color:#ed2638/);
 assert.match(layout,/\.event-ops-page \.stage-picker/);
 const cssImports=[...entry.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)].map(x=>x[1]);
 assert.equal(cssImports.at(-1),'./admin/admin-shell-layout.css','admin layout must stay last');
 assert.doesNotMatch(css,/body\s+\.usd-live\s+\.event-ops-workflow/);
});
