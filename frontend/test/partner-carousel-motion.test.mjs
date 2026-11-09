import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {shouldAutoAdvancePartnerCarousel,isIntentionalHorizontalSwipe,isHorizontalWheelGesture} from '../src/public/partner-carousel-motion.ts';

const ready={itemsCount:6,hasOverflow:true,manuallyPaused:false,hovered:false,focused:false,hidden:false,reducedMotion:false};
test('homepage partner carousel pauses only during hover or keyboard focus and resumes afterwards',()=>{
 assert.equal(shouldAutoAdvancePartnerCarousel(ready),true);
 assert.equal(shouldAutoAdvancePartnerCarousel({...ready,hovered:true}),false);
 assert.equal(shouldAutoAdvancePartnerCarousel({...ready,hovered:false}),true);
 assert.equal(shouldAutoAdvancePartnerCarousel({...ready,focused:true}),false);
 assert.equal(shouldAutoAdvancePartnerCarousel({...ready,focused:false}),true);
});
test('a deliberate manual swipe permanently stops auto-advance without disabling native swipes',()=>{
 assert.equal(shouldAutoAdvancePartnerCarousel({...ready,manuallyPaused:true}),false);
 for(const updates of [{itemsCount:1},{hasOverflow:false},{hidden:true},{reducedMotion:true}]){
  assert.equal(shouldAutoAdvancePartnerCarousel({...ready,...updates}),false);
 }
});
test('homepage carousel binds focus and hover exit instead of permanently pausing when just visited',async()=>{
 const source=await readFile(new URL('../src/public/PartnerShowcase.tsx',import.meta.url),'utf8');
 assert.match(source,/onMouseLeave=\{\(\)=>\{hovered\.current=false\}\}/);
 assert.match(source,/onBlurCapture=\{event=>/);
 assert.match(source,/shouldAutoAdvancePartnerCarousel\(/);
 assert.doesNotMatch(source,/onMouseEnter=\{\(\)=>\{manuallyPaused\.current=true\}\}/);
});

test('a simple tap on a partner card does not permanently pause automatic scrolling',()=>{
 assert.equal(isIntentionalHorizontalSwipe({x:30,y:40},{x:31,y:42}),false);
 assert.equal(isIntentionalHorizontalSwipe({x:100,y:40},{x:45,y:44}),true);
 assert.equal(isIntentionalHorizontalSwipe({x:100,y:40},{x:55,y:130}),false,'vertical page swipe is not carousel interaction');
 assert.equal(isIntentionalHorizontalSwipe({x:100,y:40},{x:70,y:43}),false,'small accidental motion is not a swipe');
});
test('vertical scrolling past partner carousel cannot stop its automatic advance',()=>{
 assert.equal(isHorizontalWheelGesture(0,125),false);
 assert.equal(isHorizontalWheelGesture(15,90),false);
 assert.equal(isHorizontalWheelGesture(80,15),true);
 assert.equal(isHorizontalWheelGesture(0,0),false);
});
test('partner carousel waits for deliberate horizontal motion before persistent pause',async()=>{
 const source=await readFile(new URL('../src/public/PartnerShowcase.tsx',import.meta.url),'utf8');
 assert.match(source,/onPointerUp=\{event=>/);
 assert.match(source,/isIntentionalHorizontalSwipe\(/);
 assert.match(source,/onWheel=\{event=>/);
 assert.match(source,/isHorizontalWheelGesture\(/);
 assert.doesNotMatch(source,/onPointerDown=\{\(\)=>\{manuallyPaused\.current=true\}\}/);
});
