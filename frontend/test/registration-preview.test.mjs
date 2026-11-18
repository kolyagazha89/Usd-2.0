import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('provisional number appears only inside the authenticated registration review, not public stage listings', async () => {
  const flow=await readFile(new URL('../src/participant/RegistrationFlow.tsx',import.meta.url),'utf8');
  const preview=await readFile(new URL('../src/participant/RegistrationNumberPreview.tsx',import.meta.url),'utf8');
  const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
  assert.match(flow,/step===2.*RegistrationNumberPreview/s);
  assert.match(preview,/registrations\/stage\//);
  assert.match(preview,/Номер предварительный/);
  assert.match(preview,/Зарегистрировано участников/);
  assert.doesNotMatch(app.slice(app.indexOf("page==='stages'&&"),app.indexOf("page==='stage-detail'&&")),/RegistrationNumberPreview|nextAvailablePrimaryNumber/);
});

test('the member configurator keeps SUB, FRONT and REAR independent of competition direction', async () => {
  const editor=await readFile(new URL('../src/admin/ConfigurationsPage.tsx',import.meta.url),'utf8');
  assert.match(editor,/\['FRONT','SUB','REAR'\]/);
  assert.match(editor,/data-direction=\{direction\}/);
  const refresh=await readFile(new URL('../src/approved-public-refresh.css',import.meta.url),'utf8');
  assert.match(refresh,/config-direction-workspace/);
  assert.doesNotMatch(refresh,/\[data-direction="BFSPL"\]/);
});

test('approved compact visuals preserve stage posters, original partner framing and real car images', async () => {
  const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
  const community=await readFile(new URL('../src/public/PublicCommunity.tsx',import.meta.url),'utf8');
  const partners=await readFile(new URL('../src/public/PartnerShowcase.tsx',import.meta.url),'utf8');
  const refresh=await readFile(new URL('../src/approved-public-refresh.css',import.meta.url),'utf8');
  assert.match(app,/usd-stage-card-approved/);
  assert.match(community,/usd-public-cars-approved/);
  assert.match(community,/usd-contact-approved/);
  const contacts=community.slice(community.indexOf("if(kind==='contacts'){"),community.indexOf("if(kind==='about')"));
  assert.ok(contacts.indexOf('p-contacts u-panel')<contacts.indexOf('p-contact-story u-panel'),
    'contact links must precede decoration in keyboard and screen-reader reading order');
  assert.match(partners,/PartnerImage/);
  assert.match(refresh,/object-fit:\s*contain/);
});
