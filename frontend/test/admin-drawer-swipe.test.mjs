import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {bindAdminDrawerSwipe} from '../src/navigation/admin-drawer-swipe.ts';

test('admin edge swipe opens and closes the drawer without changing history; other gestures remain native',()=>{
 const dom=new JSDOM('<div id="root"><div id="surface"></div><input id="input"><div id="scroll"></div><button id="button">Nav</button></div>',{url:'https://usd.test/admin/cars'});
 const root=dom.window.document.getElementById('root'),surface=dom.window.document.getElementById('surface');
 let open=false,enabled=true;const changes=[];
 const stop=bindAdminDrawerSwipe(root,{isOpen:()=>open,enabled:()=>enabled,onChange:value=>{open=value;changes.push(value)}});
 const send=(type,x,y,target=surface,count=1)=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});const touches=Array.from({length:count},(_,i)=>({identifier:i,clientX:x+i*20,clientY:y}));Object.defineProperties(event,{touches:{value:type==='touchend'?[]:touches},changedTouches:{value:touches}});target.dispatchEvent(event);return event.defaultPrevented};
 const swipe=(x,y,endX,endY,target=surface)=>{send('touchstart',x,y,target);send('touchmove',endX,endY,target);return send('touchend',endX,endY,target)};
 assert.equal(send('touchstart',5,150),true,'claim iOS edge gesture on non-passive touchstart');send('touchmove',110,155);send('touchend',110,155);assert.equal(open,true);
 assert.equal(swipe(200,200,70,205,dom.window.document.getElementById('button')),true);assert.equal(open,false);
 assert.deepEqual(changes,[true,false]);assert.equal(dom.window.location.href,'https://usd.test/admin/cars');assert.equal(dom.window.history.length,1);
 assert.equal(send('touchstart',45,150),false);assert.equal(send('touchmove',47,260),false);send('touchend',47,260);assert.equal(open,false,'vertical scrolling is never a menu swipe');
 swipe(200,150,310,152);assert.equal(open,false,'opening starts only near the left side');
 swipe(40,150,60,152);assert.equal(open,false,'small movement is a tap');
 swipe(5,150,130,152,dom.window.document.getElementById('input'));assert.equal(open,false,'inputs keep text selection');
 const scroll=dom.window.document.getElementById('scroll');Object.defineProperties(scroll,{scrollWidth:{value:500},clientWidth:{value:200}});scroll.style.overflowX='auto';swipe(40,150,150,152,scroll);assert.equal(open,false,'horizontal lists keep their own gesture');
 send('touchstart',4,150,surface,2);send('touchmove',100,152,surface,2);send('touchend',100,152,surface,2);assert.equal(open,false,'pinch is not a swipe');
 send('touchstart',4,150);send('touchcancel',100,152);send('touchend',100,152);assert.equal(open,false);
 enabled=false;assert.equal(send('touchstart',4,150),false);swipe(4,150,130,152);assert.equal(open,false,'desktop does not use touch drawer gestures');
 enabled=true;stop();swipe(4,150,130,152);assert.equal(open,false,'unmount removes the gesture handlers');dom.window.close();
});
