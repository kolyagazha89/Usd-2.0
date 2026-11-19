import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('offline conflict review appears only on central ADMIN venue page',async()=>{
 const [page,component,controller]=await Promise.all([
  readFile(new URL('../src/admin/VenueServerPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/VenueReturnReviews.tsx',import.meta.url),'utf8'),
  readFile(new URL('../../backend/src/stages/stages.controller.ts',import.meta.url),'utf8'),
 ]);
 assert.match(page,/!localMode&&<VenueReturnReviews/);
 assert.match(page,/user.role!=='ADMIN'/);
 assert.match(component,/\/stages\/venue\/returns\?page=/);
 assert.match(component,/\/stages\/venue\/returns\//);
 for(const choice of ['LINK:','NEW','DEFER'])assert.ok(component.includes(choice));
 assert.match(component,/version:selected.version,decisions/);
 assert.match(component,/Основание решения/);
 assert.match(component,/USD — Онлайн/);
 assert.match(controller,/@Roles\('ADMIN'\)\s+@Post\('venue\/returns\/:id\/decisions'\)/);
 assert.doesNotMatch(component,/BEGIN PRIVATE KEY|DATABASE_URL|VENUE_DB_ROOT_PASSWORD/);
});
