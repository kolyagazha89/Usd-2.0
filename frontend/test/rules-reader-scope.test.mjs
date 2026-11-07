import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
test('new reader styles leave historical stage snapshot typography intact',async()=>{
 const dom=new JSDOM('<body><main class="usd-live"><section class="stage-snapshot"><div class="public-rules-rich-document"><h3>Архивный заголовок</h3><p>Исторический пункт</p></div><div class="public-rules-table-wrap"><table><tr><td>Лимит</td></tr></table></div></section></main></body>');
 try{
  const nodes=[...dom.window.document.querySelectorAll('.stage-snapshot *')];
  const measure=()=>nodes.map(el=>{const s=dom.window.getComputedStyle(el);return [s.fontSize,s.lineHeight,s.margin,s.padding,s.minWidth,s.maxWidth,s.borderTopWidth,s.background]});
  const before=measure();const style=dom.window.document.createElement('style');style.textContent=await readFile(new URL('../src/rules-reader.css',import.meta.url),'utf8');dom.window.document.head.append(style);
  assert.deepEqual(measure(),before);
 }finally{dom.window.close()}
});
