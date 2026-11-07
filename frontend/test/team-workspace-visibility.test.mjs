import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const css=readFileSync(new URL('../src/teams/teams.css',import.meta.url),'utf8');
test('inactive team panels remain hidden despite grid display rules',()=>{
 assert.match(css,/\.team-workspace \[hidden\]\s*\{\s*display:\s*none\s*!important\s*;/);
});
test('team navigation remains usable on narrow screens',()=>{
 assert.match(css,/\.team-workspace-sections\s*\{/);
 assert.match(css,/flex-wrap:\s*wrap/);
 assert.match(css,/\.team-workspace-sections button:focus-visible/);
});
