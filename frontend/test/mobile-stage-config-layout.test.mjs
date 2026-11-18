import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
const app = read('../src/App.tsx');
const editor = read('../src/admin/ConfigurationsPage.tsx');
const stageCss = read('../src/approved-public-refresh.css');
const siteCss = read('../src/sitewide-premium-2026.css');

test('mobile stages use one poster-and-details row with full-width actions',()=>{
  assert.match(app,/className="usd-stage-card-info"/,'stage title and location must be grouped independently from actions');
  assert.match(stageCss,/\.usd-stage-card-approved \.usd-stage-card-copy\s*\{\s*display:contents!important/,'mobile stage details must participate in the outer grid');
  assert.match(stageCss,/\.usd-stage-card-approved \.public-stage-actions\s*\{[^}]*grid-column:1\s*\/\s*-1/,'buttons must sit below both poster and text');
  assert.match(stageCss,/\.usd-stage-card-approved \.usd-stage-poster\s*\{[^}]*align-self:start/,'poster must not stretch to the button column');
  assert.match(stageCss,/\.usd-stage-card-approved \.public-stage-actions \.public-stage-primary/,'registration CTA must be prominent across the card');
});

test('stage actions remain available according to registration and publication state',()=>{
  const list=app.slice(app.indexOf("{page==='stages'&&(loading?"),app.indexOf("{page==='stage-detail'&&"));
  assert.match(list,/s\.status!=='COMPLETED'&&s\.registrationOpen/);
  assert.match(list,/s\.resultsPublishedAt/);
  assert.match(list,/Подробнее об этапе/);
  assert.match(list,/e\.stopPropagation\(\)/,'clicking a CTA must not also navigate via the card');
});

test('member configurator keeps only one Bass Front Rear navigation',()=>{
  assert.match(editor,/className="member-config-directions"/);
  assert.doesNotMatch(editor,/className="member-config-zone-overview"/,'duplicate equipment direction cards must be removed');
  assert.match(editor,/className="member-config-readiness"/,'the current direction status remains visible');
});

test('mobile configuration routes have no reserved top spacer',()=>{
  assert.match(app,/className="participant-portal-main participant-configurations-main"/);
  assert.match(siteCss,/\.participant-configurations-main\s*\{/);
  assert.match(siteCss,/\.participant-configurations-main \.configurations-page-shell/);
  assert.match(siteCss,/\.participant-configurations-main \.configuration-editor-page/);
  assert.match(siteCss,/\.participant-configurations-main \.configuration-details-page/);
  assert.match(siteCss,/padding-top:\s*0!important/);
});

test('mobile season filter remains usable without taking an entire card row',()=>{
  assert.match(stageCss,/\.public-stage-season-filter/);
  assert.match(stageCss,/\.public-stage-season-filter select/);
  assert.match(stageCss,/\.public-stage-season-filter>span/);
});
