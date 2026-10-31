import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('first-login sends the participant without a profile through one dedicated page',async()=>{
 const [app,view]=await Promise.all([read('../src/App.tsx'),read('../src/participant/FirstLoginOnboarding.tsx')]);
 assert.match(app,/if\(!user\.participantId\)return <FirstLoginOnboarding/);
 assert.match(app,/findHistoricalProfileCandidates\((?:query|name)\)/);
 assert.match(app,/linkHistoricalProfile\(id\)/);
 assert.match(app,/onGoSite=\{\(\)=>go\('\/'\)\}/);
 assert.match(app,/onGoAdmin=\{\(\)=>go\('\/admin'\)\}/);
 assert.match(view,/c\.canSelfLink\?/);
 assert.match(view,/profile-match-new/);
 assert.match(view,/confirmNewProfile/);
 assert.match(view,/profile-match-onboarding-steps/);
 assert.match(view,/hasSearchedProfiles&&!loading/);
 assert.match(view,/onSearchNameChange\(e\.target\.value\)/);
 assert.match(view,/onSearch/);
 assert.match(view,/onLink\(c\.id\)/);
});

test('no unexpected account security forms on the very first page',async()=>{
 const [app,view]=await Promise.all([read('../src/App.tsx'),read('../src/participant/FirstLoginOnboarding.tsx')]);
 assert.doesNotMatch(view,/ParticipantAccountSecurity|account-security/);
 assert.equal((app.match(/<ParticipantAccountSecurity/g)??[]).length,1);
 assert.match(app,/\{tab==='profile'&&<ParticipantAccountSecurity email=\{user\.email\}/);
 assert.match(view,/Настройки аккаунта будут доступны в личном кабинете после выбора профиля/);
});

test('newcomer must search with a real full name and explicitly confirm creation',async()=>{
 const [app,view]=await Promise.all([read('../src/App.tsx'),read('../src/participant/FirstLoginOnboarding.tsx')]);
 assert.match(app,/if\(!confirmNewProfile\)\{setConfirmNewProfile\(true\);return\}/);
 assert.match(app,/if\(!lastName\|\|!firstName\)/);
 assert.match(app,/middleName:middleName\|\|null/);
 assert.match(app,/apiPost\('\/participants\/me'/);
 assert.match(view,/canOfferNewProfile\(searchName\)/);
 assert.match(view,/searched&&canOfferNewProfile/);
 assert.match(view,/!newLastName\.trim\(\)\|\|!newFirstName\.trim\(\)/);
 assert.match(view,/onCancelCreate/);
 assert.match(view,/type="button"/);
});

test('protected historical identities remain unselectable without admin review',async()=>{
 const view=await read('../src/participant/FirstLoginOnboarding.tsx');
 assert.match(view,/c\.canSelfLink\?/);
 assert.match(view,/onLink\(c\.id\)/);
 assert.match(view,/Эта запись уже защищена/);
 assert.doesNotMatch(view,/Обратитесь к администратору USD для ручной проверки">Нужна проверка<\/button>/);
});

test('onboarding is a premium DARK page with responsive controls and no legacy white form',async()=>{
 const [css,base,main,memberTheme,sharedUi]=await Promise.all([
  read('../src/participant/first-login-onboarding.css'),
  read('../src/styles.css'),
  read('../src/main.tsx'),
  read('../src/public/premium-member.css'),
  read('../src/premium-ui.css'),
 ]);
 assert.match(css,/body \.profile-match-page\.usd-member/);
 assert.match(css,/background:\s*#080b10/);
 assert.match(css,/\.profile-match-hero/);
 assert.match(css,/\.profile-match-search-row input/);
 assert.match(css,/font-size:16px!important/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/@media\(max-width:375px\)/);
 assert.match(css,/prefers-reduced-motion/);
 assert.doesNotMatch(base,/\/\* Historical profile matching \*\//,'legacy white onboarding CSS must be deleted');
 assert.doesNotMatch(base,/\.profile-match-page\{min-height:100vh;background:/,'do not restore the old white canvas');
 assert.doesNotMatch(memberTheme,/profile-match/,'old scoped member overrides must not win with !important');
 assert.doesNotMatch(sharedUi,/profile-match-empty/,'new empty state must own its geometry');
 assert.match(main,/import '\.\/participant-ui-polish\.css'/);
});
