import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('iPhone search clear buttons cannot collapse into a vertical stack of letters',async()=>{
 const css=await read('../src/admin/admin-shell-layout.css');
 const baseCss=await read('../src/styles.css');
 const main=await read('../src/main.tsx');
 const generic=baseCss.indexOf('.app-shell .main .search-box>button,');
 const targeted=css.match(/body\s+\.app-shell\s+\.main\s+\.content\s+\.search-box>\.usd-admin-search-clear\s*\{([^}]+)\}/);
 assert.ok(generic>=0,'the shared search style currently caps toolbar buttons at 24px');
 assert.ok(targeted,'admin search clear needs a more specific override than generic icon sizing');
 assert.ok(main.lastIndexOf("import './admin/admin-shell-layout.css';")>main.indexOf("import './styles.css';"),'scoped admin override must be imported after generic search styles');
 const rule=targeted[1];
 assert.match(rule,/max-width:\s*none\s*!important/,'clear text must not be constrained to 24px');
 assert.match(rule,/width:\s*auto\s*!important/);
 assert.match(rule,/flex:\s*0\s+0\s+auto\s*!important/);
 assert.match(rule,/white-space:\s*nowrap\s*!important/);
 assert.match(rule,/min-height:\s*44px/,'clear remains a touch-sized control');
});

test('all affected admin searches keep a labelled working reset without changing forms',async()=>{
 for(const file of ['ResourcePage.tsx','CarsPage.tsx','UsersPage.tsx']){
  const source=await read('../src/admin/'+file);
  assert.match(source,/className="usd-admin-search-clear"/,file+' retains clear action');
  assert.match(source,/aria-label="Очистить поиск/,file+' has a readable accessible name');
 }
});
