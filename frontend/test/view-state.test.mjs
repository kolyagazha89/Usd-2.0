import test from 'node:test';
import assert from 'node:assert/strict';
import {readViewState,restoreScroll,seasonYears,matchesSeason} from '../src/admin/view-state.ts';
import {recordDirectionKind,selectHomepageResults} from '../src/public-result-utils.ts';

test('season filters use season year and handle missing or invalid dates',()=>{
 const stages=[{season:{year:2025},date:'2026-01-01'},{date:'2026-05-01'},{date:'invalid'},{}];
 assert.deepEqual(seasonYears(stages),['2026','2025']);
 assert.equal(matchesSeason(stages[0],'2025'),true);
 assert.equal(matchesSeason(stages[0],'2026'),false);
 assert.equal(matchesSeason(stages[3],'ALL'),true);
});
test('saved filters survive remount and unavailable storage falls back safely',()=>{
 globalThis.sessionStorage={getItem:key=>key==='usd:view:stages:season'?'"2025"':null};
 assert.equal(readViewState('stages:season','LATEST'),'2025');
 assert.equal(readViewState('missing','ALL'),'ALL');
 globalThis.sessionStorage={getItem(){throw new Error('blocked')}};
 assert.equal(readViewState('stages:season','LATEST'),'LATEST');
 delete globalThis.sessionStorage;
});
test('restore waits for list height and stops when the user scrolls',()=>{
 const listeners=new Map();let height=200,position=0,callback,disconnected=false;
 const frames=new Map();let id=0;
 globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id};
 globalThis.cancelAnimationFrame=id=>frames.delete(id);
 const flush=()=>{for(const [id,fn] of frames){frames.delete(id);fn()}};
 globalThis.window={scrollTo:({top})=>position=Math.min(top,height),addEventListener:(e,fn)=>listeners.set(e,fn),removeEventListener:e=>listeners.delete(e)};
 globalThis.document={body:{}};
 globalThis.ResizeObserver=class {constructor(fn){callback=fn}observe(){}disconnect(){disconnected=true}};
 const stop=restoreScroll(4500);flush();assert.equal(position,200);
 height=8000;callback();flush();assert.equal(position,4500);
 listeners.get('wheel')();assert.equal(disconnected,true);assert.equal(listeners.size,0);
 stop();delete globalThis.window;delete globalThis.document;delete globalThis.ResizeObserver;
});
test('BDW and legacy BDW SPL remain eligible for homepage results',()=>{
 for(const name of ['BDW','BDWSPL','BDW SPL']){
  assert.equal(recordDirectionKind({direction:{name}}),'BDWSPL');
  const row={place:1,value:145,registrationClass:{class:{id:'bdw',direction:{name}}}};
  assert.deepEqual(selectHomepageResults([row]),[row]);
 }
});
