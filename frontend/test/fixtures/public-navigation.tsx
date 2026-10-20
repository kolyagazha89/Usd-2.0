import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../../src/App';

const state=globalThis as any;
const stages=[
  {id:'alpha',name:'Этап Альфа',stageNumber:2,date:'2026-09-01T12:00:00Z',status:'COMPLETED',season:{year:2026},resultsPublishedAt:'2026-09-01T18:00:00Z'},
  {id:'beta',name:'Этап Бета',stageNumber:1,date:'2026-08-01T12:00:00Z',status:'COMPLETED',season:{year:2026},resultsPublishedAt:'2026-08-01T18:00:00Z'},
];
const result=(stage:any)=>[{id:'result-'+stage.id,value:150,place:1,participant:{firstName:stage.name},class:{name:'Limited 2.0',unit:'DB',direction:{code:'SPL'}},registration:{stage,car:{brand:'Lada',model:stage.id}}}];
const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,35))})};
const click=async(element:HTMLElement)=>{assert.ok(element);await act(async()=>element.click());await flush()};
const stageSelect=()=>document.querySelector<HTMLSelectElement>('.public-stage-select select')!;
function assertStage(id:string){
  assert.equal(stageSelect()?.value,id);
  const stage=stages.find(stage=>stage.id===id)!;
  assert.match(document.querySelector('.public-result-context')?.textContent??'',new RegExp(stage.name));
}
export async function runPublicNavigation(){
  state.__getPublic=async(path:string)=>{
    if(path==='/stages/public')return stages;
    if(path.startsWith('/stages/public/'))return stages.find(stage=>stage.id===path.split('/').at(-1));
    if(path.startsWith('/results/stage/'))return result(stages.find(stage=>stage.id===path.split('/').at(-1)));
    if(path==='/site-settings/public')return {settings:{homepage:{blocks:[{id:'latest-results',enabled:false},{id:'live-results',enabled:false},{id:'participants',enabled:false}]}}};
    return [];
  };
  history.replaceState({},'','/results?stageId=alpha');
  const root=createRoot(document.getElementById('root')!);
  try{
    await act(async()=>root.render(<App/>));await flush();
    assertStage('alpha');
    await click([...document.querySelectorAll<HTMLButtonElement>('.public-nav button')].find(button=>button.textContent==='Этапы')!);
    const cards=[...document.querySelectorAll<HTMLElement>('.public-stage-card')];
    assert.equal(cards.length,2);
    assert.ok(cards[0].textContent?.includes('Этап Альфа'));
    assert.ok(cards[1].textContent?.includes('Этап Бета'));
    const beta=cards.find(card=>card.textContent?.includes('Этап Бета'))!;
    await click([...beta.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes('Подробнее об этапе'))!);
    assert.equal(location.pathname,'/stages/beta');
    await click([...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes('Результаты этапа'))!);
    assert.equal(location.search,'?stageId=beta');
    assertStage('beta');

    await act(async()=>{stageSelect().value='alpha';stageSelect().dispatchEvent(new window.Event('change',{bubbles:true}))});await flush();
    assert.equal(location.search,'?stageId=alpha','the stage selector must update the shareable URL');
    assertStage('alpha');
    await act(async()=>history.back());await flush();
    assert.equal(location.search,'?stageId=beta');assertStage('beta');
    await act(async()=>history.forward());await flush();
    assert.equal(location.search,'?stageId=alpha');assertStage('alpha');

    await act(async()=>{stageSelect().value='';stageSelect().dispatchEvent(new window.Event('change',{bubbles:true}))});await flush();
    assert.equal(location.search,'?stageId=');
    assert.equal(stageSelect().value,'');
    assert.equal(document.querySelectorAll('.public-result-card').length,0,'an intentional empty selection must not auto-discover another stage');

    // A browser navigation to the bare results URL should discover results again.
    await act(async()=>{history.pushState({},'','/results');window.dispatchEvent(new window.PopStateEvent('popstate'))});await flush();await flush();
    assertStage('alpha');

    // An explicit link in browser history must replace the auto-discovered selection.
    await act(async()=>{history.pushState({},'','/results?stageId=beta');window.dispatchEvent(new window.PopStateEvent('popstate'))});await flush();
    assertStage('beta');
  }finally{await act(async()=>root.unmount())}
}
