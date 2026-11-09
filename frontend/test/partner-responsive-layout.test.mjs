import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {partnerDescriptionPreview} from '../src/public/partner-model.ts';

const root=path.dirname(fileURLToPath(import.meta.url));
const source=(name)=>readFile(path.join(root,name),'utf8');

test('partner summaries do not cut words or disclose the rest before expanding',()=>{
 const long='Установочный центр и официальные поставщики оборудования. '.repeat(8);
 const preview=partnerDescriptionPreview(long,160);
 assert.equal(preview.truncated,true);
 assert.ok(preview.text.length<=160);
 assert.ok(preview.text.length>100);
 assert.ok(long.startsWith(preview.text));
 assert.ok(!preview.text.endsWith(' '));
 assert.deepEqual(partnerDescriptionPreview('   Короткий текст  ',160),{text:'Короткий текст',truncated:false});
 assert.deepEqual(partnerDescriptionPreview('',160),{text:'',truncated:false});
 assert.ok(partnerDescriptionPreview('ОченьДлинноеСлово'.repeat(30),160).text.length<=160);
});

test('only the homepage regular tier is a swipeable carousel; directory remains a grid',async()=>{
 const scratch=await mkdtemp(path.join(root,'.partner-carousel-'));
 try{
  const outfile=path.join(scratch,'showcase.mjs');
  await build({entryPoints:[path.join(root,'../src/public/PartnerShowcase.tsx')],
   bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',
   loader:{'.css':'empty'},outfile});
  const {default:PartnerShowcase}=await import(pathToFileURL(outfile).href);
  const partners=[
   {id:'general',name:'Генеральный',tier:'GENERAL',isPublished:true},
   {id:'premium',name:'Премиальный',tier:'PREMIUM',isPublished:true},
   {id:'regular-a',name:'Первый',tier:'REGULAR',isPublished:true,description:'Очень длинное описание '.repeat(20)},
   {id:'regular-b',name:'Второй',tier:'REGULAR',isPublished:true,description:'Очень длинное описание '.repeat(20)},
   {id:'studio',name:'Студия',tier:'STUDIO',isPublished:true},
  ];
  const render=(variant)=>renderToString(React.createElement(MemoryRouter,null,
   React.createElement(PartnerShowcase,{partners,variant})));
  const home=render('home');
  const directory=render('full');
  assert.match(home,/usd-partner-tier--regular[\s\S]*?usd-partner-carousel/);
  assert.equal((home.match(/usd-partner-carousel\b/g)??[]).length,1);
  assert.match(home,/aria-roledescription="карусель"/);
  assert.match(home,/Первый/);
  assert.match(home,/Второй/);
  assert.doesNotMatch(home,/Читать далее/);
  assert.doesNotMatch(directory,/usd-partner-carousel/);
  assert.match(directory,/usd-partner-showcase--full/);
  assert.match(directory,/Читать далее/);
  assert.match(directory,/aria-expanded="false"/);
  assert.match(directory,/aria-controls=/);
  assert.doesNotMatch(directory,/Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание Очень длинное описание/);
  assert.match(directory,/usd-partner-tier--studio/);
 }finally{await rm(scratch,{recursive:true,force:true})}
});

test('responsive rules keep all directory partner cards in one mobile column and fixed-height media slots',async()=>{
 const css=await source('../src/dark-velocity-sitewide.css');
 assert.match(css,/\.usd-partner-showcase--full \.usd-partner-tier--regular \.usd-partner-grid/);
 assert.match(css,/\.usd-partner-showcase--full \.usd-partner-visual/);
 assert.match(css,/--usd-partner-slot-height/);
 assert.match(css,/\.usd-partner-carousel/);
 assert.match(css,/scroll-snap-type:x mandatory/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
