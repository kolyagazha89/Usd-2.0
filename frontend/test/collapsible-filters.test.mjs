import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const base=path.dirname(fileURLToPath(import.meta.url));
const source=rel=>readFile(path.resolve(base,rel),'utf8');

test('filter drawer is a semantic, initially closed disclosure with visible active count',async()=>{
 const tmp=await mkdtemp(path.join(base,'.filter-drawer-'));
 try{
  const outfile=path.join(tmp,'module.mjs');
  await build({entryPoints:[path.resolve(base,'../src/CollapsibleFilters.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'}});
  const {default:CollapsibleFilters}=await import(pathToFileURL(outfile).href);
  const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
  const html=renderToStaticMarkup(React.createElement(CollapsibleFilters,{activeCount:2,theme:'public'},
   React.createElement('select',{'aria-label':'Направление'},React.createElement('option',null,'SPL'))));
  assert.match(html,/<details\b/);
  assert.doesNotMatch(html,/<details[^>]*\bopen\b/,'filters should be collapsed by default');
  assert.match(html,/class="usd-filter-trigger"/);
  assert.match(html,/>Фильтры</);
  assert.match(html,/Активных фильтров: 2/);
  assert.match(html,/usd-filter-theme-public/);
  assert.match(html,/aria-label="Направление"/);
 }finally{await rm(tmp,{recursive:true,force:true})}
});

test('admin and public filter-heavy screens use same disclosure instead of full-height default filter grid',async()=>{
 const paths=[
  '../src/admin/ResourcePage.tsx',
  '../src/admin/NewsPage.tsx','../src/admin/PartnersPage.tsx',
  '../src/admin/RegistrationsPage.tsx','../src/admin/InspectionsPage.tsx',
  '../src/admin/ResultsPage.tsx','../src/admin/CatalogPage.tsx',
  '../src/admin/VehicleCatalogPage.tsx','../src/admin/DisqualificationsPage.tsx',
  '../src/public/PublicMeasurements.tsx','../src/teams/TeamStageAchievements.tsx',
 ];
 for(const p of paths){
  const s=await source(p);
  assert.match(s,/<CollapsibleFilters\b/,p+' must use the shared collapsible filter control');
 }
 const css=await source('../src/collapsible-filters.css');
 assert.match(css,/\.usd-filter-drawer/);
 assert.match(css,/\.usd-filter-trigger/);
 assert.match(css,/\.usd-filter-content/);
 assert.match(css,/\[open\]/,'the drawer reveals controls when opened');
 assert.match(css,/@media\s*\(max-width:700px\)/,'mobile drawers fit small viewports');
});

test('primary search and stage choice remain visible outside the advanced filter disclosure',async()=>{
 const resource=await source('../src/admin/ResourcePage.tsx');
 assert.ok(resource.indexOf('className="search-box"')<resource.indexOf('<CollapsibleFilters'));
 const registrations=await source('../src/admin/RegistrationsPage.tsx');
 const inspections=await source('../src/admin/InspectionsPage.tsx');
 for(const [name,s] of [['registrations',registrations],['inspections',inspections]]){
  const stagePicker=s.slice(s.indexOf('className="toolbar stage-picker'));
  assert.match(stagePicker,/^className="toolbar stage-picker"><label>Этап<select/,name+' current stage is first');
  assert.ok(stagePicker.indexOf('<label>Этап<select')<stagePicker.indexOf('<CollapsibleFilters'),name+' stage is outside and before advanced filters');
 }
});
