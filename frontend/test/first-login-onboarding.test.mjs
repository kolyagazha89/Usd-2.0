import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('first-login participant onboarding offers safe history matching and newcomer path',async()=>{
 const app=await read('../src/App.tsx');
 assert.match(app,/if\(!user\.participantId\)return <div className="profile-match-page usd-member"/);
 assert.match(app,/findHistoricalProfileCandidates\((?:query|name)\)/);
 assert.match(app,/linkHistoricalProfile\(id\)/);
 assert.match(app,/c\.canSelfLink\?/);
 assert.match(app,/profile-match-new/);
 assert.match(app,/confirmNewProfile/);
 assert.match(app,/profile-match-onboarding-steps/);
 assert.match(app,/hasSearchedProfiles&&!loading/);
});

test('newcomer creation requires deliberate confirmation and at least surname plus name',async()=>{
 const app=await read('../src/App.tsx');
 assert.match(app,/if\(!confirmNewProfile\)\{setConfirmNewProfile\(true\);return\}/);
 assert.match(app,/if\(!lastName\|\|!firstName\)/);
 assert.match(app,/middleName:middleName\|\|null/);
 assert.match(app,/apiPost\('\/participants\/me'/);
 assert.match(app,/setConfirmNewProfile\(false\)/);
});

test('onboarding uses mobile-safe Dark Velocity styling without changing admin theme',async()=>{
 const [css,main]=await Promise.all([read('../src/participant-ui-polish.css'),read('../src/main.tsx')]);
 assert.match(css,/\.profile-match-onboarding-steps/);
 assert.match(css,/\.profile-match-new-warning/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(main,/import '\.\/participant-ui-polish\.css'/);
});
