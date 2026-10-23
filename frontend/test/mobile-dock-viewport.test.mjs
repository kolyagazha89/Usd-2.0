import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileDockTop} from '../src/navigation/mobileDockViewport.ts';

test('anchors the nav to the lower edge of the visual viewport',()=>{
 assert.equal(mobileDockTop(780,66),714);
 assert.equal(mobileDockTop(724,66),658);
 assert.equal(mobileDockTop(24+700,82),642);
});
test('handles a keyboard-sized viewport, bad readings and too-short viewports',()=>{
 assert.equal(mobileDockTop(330,66),264);
 assert.equal(mobileDockTop(40,66),0);
 assert.equal(mobileDockTop(Number.NaN,66),0);
 assert.equal(mobileDockTop(780,Number.POSITIVE_INFINITY),0);
});
