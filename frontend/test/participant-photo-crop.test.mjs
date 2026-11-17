import assert from 'node:assert/strict';
import test from 'node:test';
import {cropMetrics,clampCropOffsets,cropDrawRect} from '../src/participant/photo-crop-math.ts';

test('portrait photos cover a square crop without empty borders',()=>{
 const d=cropMetrics(600,1200,320,1);
 assert.equal(d.frame,320);
 assert.equal(d.width,320);
 assert.equal(d.height,640);
 const center=clampCropOffsets(0,0,d);
 assert.deepEqual(center,{x:0,y:0});
 assert.deepEqual(clampCropOffsets(900,-900,d),{x:0,y:-160});
});

test('landscape images can be dragged horizontally but never reveal transparent edges',()=>{
 const d=cropMetrics(1200,600,300,1);
 assert.equal(d.width,600);
 assert.equal(d.height,300);
 assert.deepEqual(clampCropOffsets(-900,900,d),{x:-150,y:0});
 const rect=cropDrawRect(d,{x:-150,y:0});
 assert.deepEqual(rect,{left:-300,top:0,width:600,height:300});
});

test('square images zoom within safe limits and remain clampable',()=>{
 const d=cropMetrics(500,500,200,2);
 assert.equal(d.width,400);
 assert.equal(d.height,400);
 assert.deepEqual(clampCropOffsets(200,-300,d),{x:100,y:-100});
 assert.equal(cropMetrics(500,500,200,0.1).width,200);
 assert.equal(cropMetrics(500,500,200,40).width,1000);
});

test('invalid photos and crop sizes are rejected before canvas drawing',()=>{
 for(const data of [[0,600,200],[600,0,200],[600,600,0],[-10,600,200]]){
  assert.throws(()=>cropMetrics(...data),RangeError);
 }
});
