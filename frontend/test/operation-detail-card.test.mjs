import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('opened operation cards retain assigned numbers, linked identity, zero scores and unknown places',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.operation-detail-'));
 try{
  const outfile=path.join(scratch,'card.mjs');
  await build({stdin:{contents:"export {OperationDetailCard} from './src/admin/OperationDetailCard';export {AdminNavigationContext} from './src/admin/AdminEntityLink';",resolveDir:path.join(base,'..'),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',outfile});
  const {OperationDetailCard,AdminNavigationContext}=await import(pathToFileURL(outfile).href);
  const primary={id:'spl',number:{number:99},class:{name:'Limited',direction:{name:'SPL'}}},bass={id:'bass',number:{number:101},class:{name:'BassRace 139.9',unit:'DB',direction:{name:'BassRace'}}};
  const registration={id:'r1',stageId:'s1',stage:{id:'s1',name:'Тестовый этап'},status:'ACTIVE',participantNumber:99,numbers:[{number:99},{number:101}],classes:[primary,bass],participant:{id:'p1',lastName:'Тестовый',firstName:'Иван',middleName:'Александрович',team:{name:'Команда USD'}},car:{id:'c1',brand:'Lada',model:'Vesta',registrationNumber:'А123АА123'},stageInspection:{status:'PASSED'}};
  const render=(result)=>new JSDOM(renderToStaticMarkup(React.createElement(AdminNavigationContext.Provider,{value:{path:'/admin/registrations?stageId=s1',go(){}}},React.createElement(OperationDetailCard,{registration,result,onBack(){},go(){},displayCarName:car=>car.brand+' '+car.model,enumLabel:value=>value==='DB'?'дБ':String(value)}))));
  const reg=render(),doc=reg.window.document;
  assert.equal(doc.querySelector('h2').textContent,'Регистрация');
  assert.match(doc.querySelector('.operation-detail-identity').textContent,/Тестовый Иван Александрович/);
  assert.deepEqual([...doc.querySelectorAll('.operation-detail-numbers>span')].map(el=>el.textContent),['№ 099','№ 101']);
  assert.match(doc.querySelector('.operation-detail-classes').textContent,/№ 101BassRaceBassRace 139.9/);
  for(const kind of ['participants','cars','stages'])assert.ok(doc.querySelector('a[href^="/admin/'+kind+'"]'),'linked '+kind+' is retained');
  assert.match(doc.querySelector('.operation-detail-facts').textContent,/Команда USD/);
  reg.window.close();
  const result=render({value:0,place:null,isHistorical:true,registrationClass:bass,notes:'Исторический комментарий'}),resultDoc=result.window.document;
  assert.equal(resultDoc.querySelector('.operation-result-values strong').textContent,'0');
  assert.equal(resultDoc.querySelectorAll('.operation-result-values strong')[1].textContent,'—');
  assert.match(resultDoc.querySelector('.operation-detail-classes').textContent,/№ 101/);
  assert.match(resultDoc.body.textContent,/Исторический комментарий/);
  assert.equal([...resultDoc.querySelectorAll('button')].some(button=>button.textContent.includes('Исправить')),false);
  result.window.close();
 }finally{await rm(scratch,{recursive:true,force:true})}
});
