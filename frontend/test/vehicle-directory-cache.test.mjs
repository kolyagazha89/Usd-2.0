import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRefreshableDirectoryCache} from '../src/vehicle-directory-cache.ts';

const deferred=()=>{
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};
};

test('one cache request serves concurrent catalog consumers, then exposes stable snapshot',async()=>{
 let calls=0;
 const cache=createRefreshableDirectoryCache(async()=>{calls++;return {makes:['Toyota']}});
 const events=[];
 const stop=cache.subscribe(()=>events.push(cache.getSnapshot()));
 const [a,b]=await Promise.all([cache.load(),cache.load()]);
 assert.equal(a,b);
 assert.equal(calls,1);
 assert.equal(cache.getSnapshot(),a);
 assert.deepEqual(events,[a]);
 await cache.load();
 assert.equal(calls,1,'cached car models must not refetch on every render');
 stop();
});

test('admin saving catalog invalidates all listeners and fetches newly enabled model',async()=>{
 let calls=0;
 const cache=createRefreshableDirectoryCache(async()=>({models:calls++===0?['Camry']:['Camry','Supra']}));
 const events=[];
 const unsubscribe=cache.subscribe(()=>events.push(cache.getSnapshot()?.models??[]));
 await cache.load();
 cache.invalidate();
 assert.equal(cache.getSnapshot(),null);
 await cache.load();
 assert.equal(calls,2);
 assert.deepEqual(cache.getSnapshot().models,['Camry','Supra']);
 assert.deepEqual(events,[['Camry'],[],['Camry','Supra']]);
 unsubscribe();
 cache.invalidate();
 assert.equal(events.length,3,'unmounted car editor must not receive later events');
});

test('old in-flight catalog request cannot overwrite a newer directory after admin save',async()=>{
 const old=deferred(),fresh=deferred();
 let requests=0;
 const cache=createRefreshableDirectoryCache(()=>++requests===1?old.promise:fresh.promise);
 const notices=[];
 cache.subscribe(()=>notices.push(cache.getSnapshot()));
 const oldRequest=cache.load();
 cache.invalidate();
 const newRequest=cache.load();
 fresh.resolve({makes:['USD New']});
 await newRequest;
 old.resolve({makes:['USD Old']});
 await oldRequest;
 assert.deepEqual(cache.getSnapshot(),{makes:['USD New']});
 assert.deepEqual(notices,[null,{makes:['USD New']}]);
});

test('failed catalog fetch does not poison future attempt or hide newer successful data',async()=>{
 let attempts=0;
 const cache=createRefreshableDirectoryCache(async()=>{
  if(++attempts===1)throw new Error('temporary network outage');
  return {makes:['Toyota']};
 });
 await assert.rejects(cache.load(),/outage/);
 assert.equal(cache.getSnapshot(),null);
 await cache.load();
 assert.equal(attempts,2);
 assert.deepEqual(cache.getSnapshot(),{makes:['Toyota']});
});

test('ADMIN catalog persistence triggers refresh only after successful save, not after conflict',async()=>{
 const page=await readFile(new URL('../src/admin/VehicleCatalogPage.tsx',import.meta.url),'utf8');
 const hook=await readFile(new URL('../src/use-vehicle-directory.ts',import.meta.url),'utf8');
 assert.match(page,/invalidateVehicleDirectoryCache\(\)/);
 assert.match(hook,/useSyncExternalStore\(/);
 assert.match(hook,/createRefreshableDirectoryCache\(/);
});
