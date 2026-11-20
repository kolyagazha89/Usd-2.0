import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import {SearchableSelect} from '../../src/admin/FormComponents';

function Fixture(){
 const [participantId,setParticipantId]=useState('');
 const options=[
  {id:'participant-1',label:'Иванов Иван Иванович · Команда А'},
  {id:'participant-2',label:'Петров Пётр Петрович · Команда Б'},
  {id:'participant-3',label:'Сидоров Сидор'},
 ];
 return <form>
  <label>Участник<SearchableSelect required clearOnSearch value={participantId} onChange={setParticipantId} options={options} placeholder="Поиск по ФИО" ariaLabel="Участник"/></label>
  <output>{participantId}</output>
  <button type="submit" disabled={!participantId}>Выдать дисквалификацию</button>
 </form>;
}

export async function runDisqualificationSearch(){
 const root=createRoot(document.getElementById('root')!);
 const input=()=>document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
 const output=()=>document.querySelector('output')!.textContent;
 const submit=()=>document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
 const enter=async(value:string)=>act(async()=>{
  const field=input();
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(field,value);
  field.dispatchEvent(new window.Event('input',{bubbles:true}));
 });
 const select=async()=>act(async()=>{
  const option=document.querySelector<HTMLButtonElement>('[role="listbox"] [role="option"]');
  assert.ok(option,'matching participant suggestion must be displayed');
  option.click();
 });
 try{
  await act(async()=>root.render(<Fixture/>));
  assert.equal(input().getAttribute('role'),'combobox');
  assert.equal(submit().disabled,true);
  await act(async()=>input().focus());
  await enter('Иванов');
  assert.match(document.querySelector('[role="listbox"]')?.textContent??'',/Иванов Иван/);
  assert.doesNotMatch(document.querySelector('[role="listbox"]')?.textContent??'',/Петров/);
  await select();
  assert.equal(output(),'participant-1');
  assert.equal(submit().disabled,false);
  await act(async()=>input().focus());
  await enter('Петров');
  assert.equal(output(),'','typing a new name must invalidate the previously selected participant');
  assert.equal(submit().disabled,true);
  assert.equal(input().checkValidity(),false);
  await select();
  assert.equal(output(),'participant-2');
  assert.equal(submit().disabled,false);
 }finally{await act(async()=>root.unmount())}
}
