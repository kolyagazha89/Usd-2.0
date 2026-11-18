import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('../src/App.tsx');
const css=read('../src/approved-public-refresh.css');
const stageList=app.slice(app.indexOf("{page==='stages'&&(loading?"),app.indexOf("{page==='stage-detail'"));
const mobile=css.slice(css.indexOf('@media(max-width:740px)'),css.indexOf('@media(max-width:410px)'));

test('mobile stage card has a full-width status row, poster/content row, and full-width action footer',()=>{
  const header=stageList.indexOf('className="public-stage-card-top usd-stage-card-header"');
  const poster=stageList.indexOf('className="usd-stage-poster"');
  const copy=stageList.indexOf('className="usd-stage-card-copy"');
  const actions=stageList.indexOf('className="public-stage-actions usd-stage-card-actions"');
  assert.ok(header>=0&&header<poster&&poster<copy&&copy<actions,'card regions have separate sibling containers');
  assert.match(stageList,/<div className="usd-stage-card-copy"><h2>/);
  assert.match(stageList,/<\/div><div className="public-stage-actions usd-stage-card-actions">/);
  assert.match(mobile,/\.usd-stage-card-header\s*\{[^}]*grid-column:1\s*\/\s*-1/s);
  assert.match(mobile,/\.usd-stage-poster\s*\{[^}]*grid-column:1/s);
  assert.match(mobile,/\.usd-stage-card-copy\s*\{[^}]*grid-column:2/s);
  assert.match(mobile,/\.usd-stage-card-actions\s*\{[^}]*grid-column:1\s*\/\s*-1/s);
  assert.doesNotMatch(mobile,/grid-template-columns:minmax\(0,48%\)/);
});

test('original stage posters remain uncropped and avoid stretched poster-column backgrounds',()=>{
  assert.match(stageList,/PublicPhoto className="public-stage-list-poster" kind="stage" src=\{settings\.homepage\?\.stagePosters\?\.\[s\.id\]\}/);
  assert.match(css,/\.usd-stage-poster\s*\{[^}]*align-self:flex-start/s);
  assert.match(css,/\.public-stage-list-poster\s*\{[^}]*height:auto!important;[^}]*aspect-ratio:auto!important;/s);
  assert.match(mobile,/\.usd-stage-poster\s*\{[^}]*height:auto/s);
});

test('mobile stage actions emphasize registration or results and keep details as a secondary link',()=>{
  assert.match(stageList,/className="public-stage-secondary usd-stage-card-more"/);
  assert.match(stageList,/className=\{s\.status==='COMPLETED'\?'public-stage-primary public-stage-results':'public-stage-secondary public-stage-results'\}/);
  assert.match(stageList,/go\('\/login\?next='/);
  assert.match(stageList,/go\('\/results\?stageId='/);
  assert.match(mobile,/\.usd-stage-card-actions\s+\.public-stage-primary\s*\{[^}]*order:0/s);
  assert.match(mobile,/\.usd-stage-card-actions\s+\.usd-stage-card-more\s*\{[^}]*order:2/s);
});

test('mobile season selector uses two compact rows without losing the year or stage count',()=>{
  assert.match(stageList,/Последний сезон/);
  assert.match(stageList,/\{seasonStages\.length\} этапов/);
  assert.match(mobile,/\.public-stage-season-filter\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/s);
  assert.match(mobile,/\.public-stage-season-filter select\s*\{[^}]*grid-column:1\s*\/\s*-1/s);
  assert.match(mobile,/\.public-stage-season-filter span\s*\{[^}]*grid-column:2/s);
});
