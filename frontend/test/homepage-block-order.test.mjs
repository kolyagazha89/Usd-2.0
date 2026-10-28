import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';

test('each CMS homepage dashboard and bottom block has its own order and visibility',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url));
 const scratch=await mkdtemp(path.join(base,'.homepage-block-order-'));
 try{
  const outfile=path.join(scratch,'home.mjs');
  await build({stdin:{contents:"export {default} from './src/public/PremiumHome'",resolveDir:path.join(base,'..'),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',loader:{'.css':'empty'},outfile});
  const {default:Home}=await import(pathToFileURL(outfile).href);
  const render=(blocks,results=[],partners=[])=>renderToString(React.createElement(MemoryRouter,null,React.createElement(Home,{
   settings:{homepage:{blocks,valuesCards:[]},partners,news:[]},
   stages:[],results,records:[],participants:[],liveResults:[],loading:false,
  })));
  const ids=['documents','records','teams','community','latest-results','live-results','live-stream'];
  const blocks=ids.map(id=>({id,enabled:true}));
  const html=render(blocks);
  for(const [index,id] of ids.entries()){
   assert.match(html,new RegExp('data-home-block="'+id+'" style="order:'+index+'"'),id+' must have its own CSS order');
  }
  assert.equal((html.match(/data-home-block=/g)??[]).length,ids.length,'every block must be independently rendered');
  const hidden=render(blocks.map(item=>item.id==='records'?{...item,enabled:false}:item));
  assert.doesNotMatch(hidden,/data-home-block="records"/,'CMS hidden records must not leave a blank card');
  assert.match(hidden,/data-home-block="teams" style="order:2"/,'hiding records must not remove the team block');
  const winners=Array.from({length:6},(_,index)=>({id:'winner-'+index,place:1,value:150+index,participant:{id:'p'+index,firstName:'Тест',lastName:'Участник'},registrationClass:{class:{name:'SPL '+index,direction:{name:'SPL'},unit:'DB'}},car:{brand:'Lada',model:'Vesta'}}));
  const winnersHtml=render(blocks,winners);
  assert.equal((winnersHtml.match(/class="u-medal"/g)??[]).length,6,'all six selected winners must appear on the homepage');
  const withPartners=[...blocks,{id:'partners',enabled:true}];
  const draftOnly=render(withPartners,[],[{id:'draft',name:'Draft partner',isActive:true,isPublished:false}]);
  assert.doesNotMatch(draftOnly,/u-home-partners/,'unpublished partners must not create an empty homepage section');
  const published=render(withPartners,[],[{id:'published',name:'Published partner',isActive:true,isPublished:true,tier:'GENERAL'}]);
  assert.match(published,/u-home-partners/);
  assert.match(published,/Published partner/);
  const swapped=render([...blocks].reverse());
  assert.match(swapped,/data-home-block="latest-results" style="order:0"/);
  assert.match(swapped,/data-home-block="documents" style="order:6"/);
 }finally{await rm(scratch,{recursive:true,force:true})}
});
