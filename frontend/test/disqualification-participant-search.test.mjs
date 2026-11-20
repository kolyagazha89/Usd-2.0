import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('disqualification directory uses authenticated operational lookup, not filtered public profiles',async()=>{
 const [page,controller,service]=await Promise.all([
  readFile(new URL('../src/admin/DisqualificationsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../../backend/src/participants/participants.controller.ts',import.meta.url),'utf8'),
  readFile(new URL('../../backend/src/participants/participants.service.ts',import.meta.url),'utf8'),
 ]);
 assert.match(page,/apiGet<any>\('\/participants\/lookup'\)/,'admin form must load all operational identities');
 assert.doesNotMatch(page,/apiGet<any>\('\/participants'\)/,'the public endpoint removes profiles without publication consent');
 assert.match(controller,/@Roles\('ADMIN'\)\s+@Get\('participants\/lookup'\)/,'the directory must remain protected');
 const section=service.split('async findAllForOperations(request: AuthenticatedRequest) {')[1]?.split('// PUBLIC PARTICIPANTS')[0]??'';
 assert.match(section,/where: \{ mergeAsSource: \{ is: null \} \}/,'merged aliases must not be shown');
 assert.doesNotMatch(section,/where:[^\n]*isPublic: true/,'private participants must remain selectable for admin sanctions');
});

test('new disqualification searches participants by name instead of opening a native select',async()=>{
 const page=await readFile(new URL('../src/admin/DisqualificationsPage.tsx',import.meta.url),'utf8');
 const field=page.match(/<label>Участник([\s\S]*?)<\/label>/)?.[1];
 assert.ok(field,'participant field must exist');
 assert.match(page,/import \{SearchableSelect\} from '\.\/FormComponents'/);
 assert.match(field,/<SearchableSelect/);
 assert.doesNotMatch(field,/<select/);
 assert.match(field,/value=\{v\.participantId\}/);
 assert.match(field,/options=\{participants\.map\(/);
 assert.match(field,/lastName/);
 assert.match(field,/firstName/);
 assert.match(field,/middleName/);
 assert.match(field,/clearOnSearch/,'editing the search must clear an existing selection');
 assert.match(page,/disabled=\{saving\|\|!v\.participantId\|\|!v\.reason\.trim\(\)\}/);
});

test('searching again clears previous participant ID before a dangerous submission',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url));
 const scratch=await mkdtemp(path.join(base,'.disqualification-search-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test'});
 const keys={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true};
 const previous=new Map(Object.keys(keys).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  for(const[key,value]of Object.entries(keys))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const outfile=path.join(scratch,'fixture.mjs');
  await build({entryPoints:[path.join(base,'fixtures/disqualification-search.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external'});
  await(await import(pathToFileURL(outfile).href)).runDisqualificationSearch();
 }finally{
  dom.window.close();
  for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}
  await rm(scratch,{recursive:true,force:true});
 }
});
