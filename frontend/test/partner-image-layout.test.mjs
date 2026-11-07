import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePartnerImageLayout} from '../src/public/partner-image-layout.ts';

test('legacy and malformed image layouts use safe centered logo defaults',()=>{
 for(const value of [undefined,null,[],false,'cover',{mode:'javascript:bad'},
   {mode:'BANNER',aspectWidth:1,aspectHeight:100},
   {mode:'LOGO',aspectWidth:16}, {mode:'LOGO',positionX:'url(bad)'},
   {mode:'BANNER',constructor:'private metadata'}]){
  assert.deepEqual(normalizePartnerImageLayout(value),
   {mode:'LOGO',scale:100,positionX:50,positionY:50});
 }
});

test('custom proportions, uniform scaling and focal position survive normalization',()=>{
 const layout={mode:'BANNER',aspectWidth:2.5,aspectHeight:1,scale:175,positionX:20,positionY:80};
 assert.deepEqual(normalizePartnerImageLayout(layout),layout);
 assert.deepEqual(normalizePartnerImageLayout({mode:'LOGO',aspectWidth:1,aspectHeight:2}),
  {mode:'LOGO',aspectWidth:1,aspectHeight:2,scale:100,positionX:50,positionY:50});
});

test('unsafe numeric values never enter rendering styles',()=>{
 for(const [field,values] of Object.entries({scale:[49,301,NaN,Infinity,'150'],
   positionX:[-1,101,Infinity,'0'],positionY:[-1,101,null],
   aspectWidth:[0,101,NaN,'16']})){
  for(const value of values){
   const layout={mode:'BANNER',aspectWidth:16,aspectHeight:9,[field]:value};
   assert.equal(normalizePartnerImageLayout(layout).mode,'LOGO');
  }
 }
});
