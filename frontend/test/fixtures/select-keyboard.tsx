import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import {SearchableSelect} from '../../src/admin/FormComponents';
function Fixture(){const[value,setValue]=useState('');return <form><label>Класс<SearchableSelect required value={value} onChange={setValue} options={[{id:'one',label:'Первый'},{id:'two',label:'Второй'},{id:'three',label:'Третий'}]}/></label><output>{value}</output><button type="button" onClick={()=>setValue('')}>Очистить</button></form>}
export async function runSelectKeyboard(){
 const root=createRoot(document.getElementById('root')!);
 const key=async(value:string)=>act(async()=>{document.querySelector('input')!.dispatchEvent(new window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}))});
 const type=async(value:string)=>act(async()=>{const input=document.querySelector('input')!;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}))});
 try{
  await act(async()=>root.render(<Fixture/>));
  const input=document.querySelector('input')!;
  assert.equal(input.getAttribute('role'),'combobox');assert.equal(input.checkValidity(),false);
  await act(async()=>input.focus());
  await key('ArrowDown');await key('Enter');
  assert.equal(document.querySelector('output')?.textContent,'two');assert.equal(input.value,'Второй');assert.equal(input.checkValidity(),true);
  await key('ArrowDown');await key('End');await key('Enter');assert.equal(input.value,'Третий');
  await key('ArrowDown');await type('Перв');await key('Escape');assert.equal(input.value,'Третий');
  await act(async()=>document.querySelector<HTMLButtonElement>('form > button')!.click());
  await key('ArrowDown');await type('Неизвестный');
  assert.equal(input.checkValidity(),false,'typing must not satisfy a required relation without selecting an option');
  assert.match(document.querySelector('[role="listbox"]')?.textContent??'',/Ничего не найдено/);
  await key('Escape');
  assert.equal(document.querySelectorAll('[role="listbox"]').length,0);
 }finally{await act(async()=>root.unmount())}
}
