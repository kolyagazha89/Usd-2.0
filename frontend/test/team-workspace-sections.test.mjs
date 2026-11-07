import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../src/teams/TeamWorkspace.tsx',import.meta.url),'utf8');

test('team commander workspace has separate accessible membership and publication sections',()=>{
 assert.match(source,/aria-label="Разделы управления командой"/);
 assert.match(source,/aria-controls="team-settings-panel"/);
 assert.match(source,/aria-controls="team-members-panel"/);
 assert.match(source,/aria-controls="team-posts-panel"/);
 assert.match(source,/id="team-settings-panel"/);
 assert.match(source,/id="team-members-panel"/);
 assert.match(source,/id="team-posts-panel"/);
});

test('switching team sections does not discard in-progress post draft',()=>{
 assert.match(source,/const \[section,setSection\]=useState/);
 assert.match(source,/hidden=\{section!=='posts'\}/);
 assert.match(source,/hidden=\{section!=='members'\}/);
});
