import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {shouldAutoAdvancePartnerCarousel} from '../src/public/partner-carousel-motion.ts';

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
