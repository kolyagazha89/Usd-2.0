import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('ADMIN participant details open the actual vehicle card by ID', async () => {
  const [participants, cars, routes] = await Promise.all([
    read('../src/admin/ParticipantsPage.tsx'),
    read('../src/admin/CarsPage.tsx'),
    read('../src/admin/AdminRoutes.tsx'),
  ]);
  assert.match(participants, /\/admin\/cars\?carId=/);
  assert.match(participants, /encodeURIComponent\(car\.id\)/);
  assert.match(cars, /URLSearchParams\(path\.split\('\?'\)\[1\]/);
  assert.match(cars, /cars\.find\(.*\.id===carId\)/);
  assert.match(routes, /<CarsPage[^>]*path=\{path\}/);
});

test('ADMIN users identify and open their linked participant profiles', async () => {
  const [users, routes, auth] = await Promise.all([
    read('../src/admin/UsersPage.tsx'),
    read('../src/admin/AdminRoutes.tsx'),
    read('../../backend/src/auth/auth.service.ts'),
  ]);
  assert.match(auth, /participant:\s*\{\s*select:\s*\{\s*id:\s*true/);
  assert.match(users, /Профиль USD/);
  assert.match(users, /Не привязан/);
  assert.match(users, /\/admin\/participants\?view=/);
  assert.match(routes, /<UsersPage[^>]*go=\{go\}/);
});

test('ADMIN participants list exposes account or historical email, not public participant data', async () => {
  const [participants, service] = await Promise.all([
    read('../src/admin/ParticipantsPage.tsx'),
    read('../../backend/src/participants/participants.service.ts'),
  ]);
  assert.match(participants, /\{key:'email',label:'Email'\}/);
  assert.match(participants, /Архивный email/);
  assert.match(service, /participantLegacyEmail\.findMany/);
  assert.match(service, /actor\.role === 'ADMIN'/);
});
