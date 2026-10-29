import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';

test('homepage hides empty CMS values and their hero shortcut, but renders visible cards',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url));
 const scratch=await mkdtemp(path.join(base,'.homepage-values-'));
 try{
  const outfile=path.join(scratch,'home.mjs');
  await build({stdin:{contents:"export {default} from './src/public/PremiumHome'",resolveDir:path.join(base,'..'),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',loader:{'.css':'empty'},outfile});
  const {default:Home}=await import(pathToFileURL(outfile).href);
  const render=homepage=>renderToString(React.createElement(MemoryRouter,null,React.createElement(Home,{settings:{homepage},stages:[],results:[],records:[],participants:[],liveResults:[],loading:false})));
  for(const valuesCards of [undefined,[],[{id:'people',enabled:false}], [null]]){
   const html=render({valuesCards});
   assert.doesNotMatch(html,/id="usd-values"/,'empty sections must not leave a blank frame');
   assert.doesNotMatch(html,/Что такое USD/,'hero must not offer a shortcut to missing content');
  }
  const valuesCards=[{id:'people',enabled:true,heading:'Сообщество',subtitle:'USD',description:'Люди чемпионата',path:'/participants'}];
  const visible=render({valuesCards});
  assert.match(visible,/id="usd-values"/);
  assert.match(visible,/Что такое USD/);
  assert.match(visible,/Люди чемпионата/);
  assert.match(visible,/href="\/participants"/);
  assert.doesNotMatch(render({valuesCards,blocks:[{id:'values',enabled:false}]}),/id="usd-values"|Что такое USD/);
  const customTitle=render({heroTitle:'USD',valuesCards:[]});
  assert.match(customTitle,/<h1 class="u-wordmark-title">USD<\/h1>/,'CMS must allow the organizer to set the exact USD brand headline');
  assert.doesNotMatch(customTitle,/Ultimate<br/,'custom hero title must replace the default cinematic heading');
 }finally{await rm(scratch,{recursive:true,force:true})}
});
