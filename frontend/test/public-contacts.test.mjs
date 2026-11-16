import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicContactLinks} from '../src/public/public-contacts-model.ts';

test('contact links use the same keys as the admin contact settings, including VK', () => {
 const contacts={email:'usd@example.org',vk:'https://vk.me/usd',telegram:'https://t.me/usd',youtube:'https://youtube.com/@usd',rutube:'https://rutube.ru/channel/1234/',whatsapp:'https://wa.me/79990000000'};
 const links=publicContactLinks(contacts,{});
 assert.deepEqual(links.map(link=>link.key),['telegram','vk','youtube','rutube','whatsapp']);
 assert.equal(links.find(link=>link.key==='vk')?.url,'https://vk.me/usd');
 assert.equal(links.find(link=>link.key==='telegram')?.label,'TELEGRAM');
});

test('legacy social links still display, but saved contact values take priority', () => {
 const links=publicContactLinks({vk:'https://vk.com/new'},{vk:'https://vk.com/old',telegram:'https://t.me/legacy'});
 assert.deepEqual(links.map(link=>[link.key,link.url]),[['telegram','https://t.me/legacy'],['vk','https://vk.com/new']]);
});

test('legacy social links outside current admin channel list stay visible', () => {
 const links=publicContactLinks({}, {website:'https://usd.example.com',discord:'https://discord.gg/example'});
 assert.deepEqual(links.filter(link=>['website','discord'].includes(link.key)).map(link=>link.key),['website','discord']);
});

test('blank and unsafe contact URLs do not appear as clickable channels', () => {
 const links=publicContactLinks(
  {vk:'javascript:alert(1)',telegram:' //evil.example',youtube:'mailto:someone@example.org',rutube:'',whatsapp:'https://wa.me/79990000000'},
  {vk:'https://vk.com/fallback'}
 );
 assert.deepEqual(links.map(link=>[link.key,link.url]),[['whatsapp','https://wa.me/79990000000']]);
});

test('public contacts wiring consumes saved contacts and preserves optional phone and address fields', () => {
 const component=readFileSync(new URL('../src/public/PublicCommunity.tsx',import.meta.url),'utf8');
 const admin=readFileSync(new URL('../src/admin/SiteSettingsPage.tsx',import.meta.url),'utf8');
 assert.match(component,/publicContactLinks\(contacts,settings\.social\)/);
 assert.match(component,/contacts\.phone/);
 assert.match(component,/contacts\.address/);
 assert.match(component,/!emailHref&&!phoneHref&&!address&&!links\.length/);
 for(const key of ['telegram','vk','youtube','rutube','whatsapp'])
  assert.ok(admin.includes("'"+key+"'"),'contact field missing in admin: '+key);
});
