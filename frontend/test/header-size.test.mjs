import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {observeHeaderSize} from '../src/navigation/header-size.ts';

test('header reservation follows actual border-box height and cleans up on route change',()=>{
 const dom=new JSDOM('<div class="usd-live"><header></header></div>');
 const shell=dom.window.document.querySelector('div'),header=shell.querySelector('header');
 let height=67,notify,disconnected=false;
 header.getBoundingClientRect=()=>({height});
 class Observer{constructor(callback){notify=callback}observe(){}disconnect(){disconnected=true}}
 const previous=globalThis.ResizeObserver;
 globalThis.ResizeObserver=Observer;
 try{
  const stop=observeHeaderSize(header,'--usd-public-header-size');
  assert.equal(shell.style.getPropertyValue('--usd-public-header-size'),'67px');
  height=109.5;notify();
  assert.equal(shell.style.getPropertyValue('--usd-public-header-size'),'110px');
  stop();
  assert.equal(disconnected,true);
  assert.equal(shell.style.getPropertyValue('--usd-public-header-size'),'');
 }finally{globalThis.ResizeObserver=previous;dom.window.close()}
});

test('cabinet height includes safe-area padding and ignores hidden zero-height observations',()=>{
 const dom=new JSDOM('<div class="usd-member"><header></header></div>');
 const shell=dom.window.document.querySelector('div'),header=shell.querySelector('header');
 let height=119,notify;
 header.getBoundingClientRect=()=>({height});
 const previous=globalThis.ResizeObserver;
 globalThis.ResizeObserver=class{constructor(callback){notify=callback}observe(){}disconnect(){}};
 try{
  const stop=observeHeaderSize(header,'--usd-member-header-size');
  assert.equal(shell.style.getPropertyValue('--usd-member-header-size'),'119px');
  height=0;notify();
  assert.equal(shell.style.getPropertyValue('--usd-member-header-size'),'119px');
  stop();
 }finally{globalThis.ResizeObserver=previous;dom.window.close()}
});
