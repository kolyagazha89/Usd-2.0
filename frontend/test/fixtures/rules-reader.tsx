import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import PublicRulesPage from '../../src/PublicRulesPage';
const bold=(text:string)=>({type:'paragraph',text,runs:[{text,bold:true}]});
export async function runRulesReader(){
 const root=createRoot(document.getElementById('root')!);
 const blocks=[bold('3. Классы SPL и ограничения.'),bold('SPL Limited 2.0'),{type:'paragraph',text:'Первое условие: ограничение 4000 Вт.',runs:[{text:'Первое условие: '},{text:'ограничение',bold:true},{text:' 4000 Вт.',href:'https://example.test/rules'}]},bold('129.9 dB 139.9 dB 149.9 dB 159.9 dB'),{type:'list-item',text:'Соседнее условие',ordered:true},{type:'table',rows:[['Класс','Лимит'],['Limited','4000 Вт']],cellRuns:[[[],[]],[[],[{text:'4000 '},{text:'Вт',bold:true}]]]}];
 const settings={registration:{rulesDocument:{published:{blocks,url:'/rules.docx',publishedAt:'2026-11-01T00:00:00Z'}}}};
 const click=async(e:HTMLElement|null)=>{assert.ok(e);await act(async()=>e.click())};
 const input=async(value:string)=>{const e=document.querySelector<HTMLInputElement>('[aria-label="Поиск по регламенту"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(e,value);e.dispatchEvent(new window.Event('input',{bubbles:true}))})};
 try{
  await act(async()=>root.render(<PublicRulesPage settings={settings} go={()=>{}}/>));
  const reader=document.querySelector('.public-rules-rich-document')!;
  const original=reader.textContent;
  const download=document.querySelector<HTMLAnchorElement>('.public-rules-original-doc a')!;
  assert.ok(download,'original is available');assert.ok(download.compareDocumentPosition(reader)&Node.DOCUMENT_POSITION_FOLLOWING,'download is before the document');
  const toggle=document.querySelector<HTMLButtonElement>('[aria-controls="rules-contents"]')!;
  assert.ok(toggle,'mobile contents toggle');await click(toggle);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  const link=[...document.querySelectorAll<HTMLAnchorElement>('#rules-contents a')].find(a=>a.textContent==='SPL Limited 2.0')!;
  await click(link);assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(document.activeElement?.id,'rules-doc-heading-1');
  assert.equal(document.querySelectorAll('#rules-contents a').length,2,'dB row is ordinary text');
  await input('условие: ограничение 4000');assert.equal(reader.querySelectorAll('#rules-block-2 mark').length,3,'a phrase crossing plain, bold and link runs is highlighted');assert.ok(reader.querySelector('#rules-block-2 strong mark'));assert.ok(reader.querySelector('#rules-block-2 a mark'));
  await input('4000 Вт');assert.equal(reader.querySelectorAll('td mark').length,2,'table cell phrase crosses formatting runs');
  await input('4000');assert.equal(reader.textContent,original,'search keeps all clauses and table text');
  assert.equal(document.querySelectorAll('[data-rules-match="true"]').length,2);
  assert.ok(reader.querySelector('mark'));assert.match(document.querySelector('[role="status"]')?.textContent??'',/1 из 2/);
  await click(document.querySelector('[aria-label="Следующее совпадение"]'));assert.match(document.querySelector('[role="status"]')?.textContent??'',/2 из 2/);
  await input('нет-совпадения');assert.equal(reader.textContent,original);assert.match(document.querySelector('[role="status"]')?.textContent??'',/Ничего не найдено/);
  await click([...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Сбросить поиск')!);assert.equal(reader.querySelector('mark'),null);
  assert.equal(document.querySelector('.public-rules-table-wrap')?.getAttribute('tabindex'),'0');
 }finally{await act(async()=>root.unmount())}
}
