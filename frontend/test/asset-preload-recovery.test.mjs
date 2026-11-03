import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ASSET_RETRY_KEY,ASSET_RETRY_COOLDOWN_MS,mayRetryAssetPreload,installAssetPreloadRecovery} from '../src/asset-preload-recovery.ts';

test('only one automatic reload is allowed per bounded cooldown',()=>{
 const now=1_800_000_000_000;
 assert.equal(mayRetryAssetPreload(null,now),true);
 assert.equal(mayRetryAssetPreload(String(now-1),now),false);
 assert.equal(mayRetryAssetPreload(String(now-ASSET_RETRY_COOLDOWN_MS),now),true);
 assert.equal(mayRetryAssetPreload('not-a-number',now),true);
 assert.equal(mayRetryAssetPreload(String(now+10),now),true);
});

test('Vite preload failure is prevented, reloads once and exposes manual recovery instead of a loop',()=>{
 const existing={window:globalThis.window,document:globalThis.document};
 const listeners=new Map(), storage=new Map(), notices=[];
 let reloadCount=0;
 const createElement=(tag)=>({
  tag,dataset:{},style:{},attributes:{},
  setAttribute(key,value){this.attributes[key]=value},
  append(...children){this.children=children},
  addEventListener(key,fn){this.actions??={};this.actions[key]=fn},
 });
 globalThis.window={
  addEventListener:(type,fn)=>listeners.set(type,fn),
  sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  location:{reload:()=>{reloadCount++}},
 };
 globalThis.document={
  querySelector:()=>notices.length?notices[0]:null,
  createElement,
  body:{append:element=>notices.push(element)},
 };
 try{
  installAssetPreloadRecovery();
  const handler=listeners.get('vite:preloadError');
  assert.equal(typeof handler,'function');
  let prevented=0;
  handler({preventDefault:()=>{prevented++}});
  assert.equal(reloadCount,1);
  assert.match(storage.get(ASSET_RETRY_KEY),/^\d+$/);
  handler({preventDefault:()=>{prevented++}});
  handler({preventDefault:()=>{prevented++}});
  assert.equal(reloadCount,1,'recent failed refresh cannot reload forever');
  assert.equal(prevented,3);
  assert.equal(notices.length,1,'manual banner is not duplicated');
  assert.equal(notices[0].attributes.role,'alert');
  assert.match(notices[0].children[0].textContent,/USD обновился/);
  notices[0].children[1].actions.click();
  assert.equal(reloadCount,2,'manual retry is explicitly user-triggered');
 }finally{
  if(existing.window===undefined)delete globalThis.window;else globalThis.window=existing.window;
  if(existing.document===undefined)delete globalThis.document;else globalThis.document=existing.document;
 }
});

test('private-storage failures avoid automated reloads',()=>{
 const previous={window:globalThis.window,document:globalThis.document};
 const listeners=new Map(),notices=[];
 let reloads=0;
 globalThis.window={
  addEventListener:(type,fn)=>listeners.set(type,fn),
  get sessionStorage(){throw new Error('blocked')},
  location:{reload:()=>{reloads++}},
 };
 globalThis.document={
  querySelector:()=>null,
  createElement:(tag)=>({tag,dataset:{},style:{},setAttribute(){},append(){},addEventListener(){}}),
  body:{append:x=>notices.push(x)},
 };
 try{
  installAssetPreloadRecovery();
  listeners.get('vite:preloadError')({preventDefault(){}});
  assert.equal(reloads,0);
  assert.equal(notices.length,1);
 }finally{
  if(previous.window===undefined)delete globalThis.window;else globalThis.window=previous.window;
  if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document;
 }
});

test('asset recovery is registered before React creates the root',async()=>{
 const main=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.match(main,/installAssetPreloadRecovery\(\);[\s\S]*createRoot\(/);
});
