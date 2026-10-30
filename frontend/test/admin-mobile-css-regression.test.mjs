import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=(name)=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const entry=source('main.tsx');
const theme=source('dark-velocity-sitewide.css');
const consistency=source('ui-consistency.css');

// Regression: the final theme previously reintroduced a white active sidebar
// item after the mobile stylesheet set it to dark. Both declarations used !important.
test('admin mobile stylesheet order and final theme agree on active navigation',()=>{
 const imports=[...entry.matchAll(/import ['"]\.\/([^'"]+\.css)['"];?/g)].map(m=>m[1]);
 assert.ok(imports.indexOf('ui-consistency.css')>=0);
 assert.ok(imports.indexOf('dark-velocity-sitewide.css')>imports.indexOf('ui-consistency.css'));
 const activeRules=[...theme.matchAll(/body \.app-shell \.sidebar \.nav-item\.active\s*\{([^}]+)\}/g)].map(m=>m[1]);
 assert.ok(activeRules.length>0);
 for(const rule of activeRules){
  assert.doesNotMatch(rule,/background\s*:\s*(?:linear-gradient\([^;]*#fff|#fff|white)/i);
  assert.doesNotMatch(rule,/color\s*:\s*#(?:161c26|111)(?:\s|!|;)/i);
 }
});

test('admin mobile viewport remains full-width in final loaded theme',()=>{
 assert.match(theme,/@media\s*\(max-width:\s*760px\)/);
 assert.match(theme,/body \.app-shell \.main\s*\{[^}]*margin-left:\s*0!important;[^}]*width:\s*100%!important/s);
 assert.match(theme,/body \.app-shell \.sidebar\s*\{[^}]*max-width:\s*86vw!important/s);
 assert.match(consistency,/Prevent iOS Safari form-focus zoom/);
});
