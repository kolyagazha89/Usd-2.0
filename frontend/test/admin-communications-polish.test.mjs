import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 filterMailJournalEntries,filterNewsItems,filterPartners,mailTypeName,pushTemplatesChanged,
} from '../src/admin/admin-communications-utils.ts';

const source=async file=>readFile(new URL('../src/admin/'+file,import.meta.url),'utf8');

test('mail journal search supports address and readable event types but never needs message contents',()=>{
 const rows=[
  {id:'1',recipient:'Irina@Example.Ru',type:'AUTH_EMAIL_VERIFICATION',status:'PROVIDER_ACCEPTED'},
  {id:'2',recipient:'test@usd.ru',type:'AUTH_PASSWORD_RESET',status:'FAILED'},
 ];
 assert.deepEqual(filterMailJournalEntries(rows,'  IRINA '),[rows[0]]);
 assert.deepEqual(filterMailJournalEntries(rows,'подтверждение email'),[rows[0]]);
 assert.deepEqual(filterMailJournalEntries(rows,'восстановление'),[rows[1]]);
 assert.deepEqual(filterMailJournalEntries(rows,'тестнет'),[]);
 assert.equal(mailTypeName('OTHER_EVENT'),'OTHER EVENT');
});

test('news filters treat historical missing publication flags as published and do not mutate input',()=>{
 const rows=[
  {id:'a',title:'Кубок Тюмени',excerpt:'Этап',isPublished:true},
  {id:'b',title:'Новая трасса',excerpt:'Проект',isPublished:false},
  {id:'c',title:'Архив 2024',excerpt:'Прошлый сезон'},
 ];
 const original=JSON.stringify(rows);
 assert.deepEqual(filterNewsItems(rows,'','published'),[rows[0],rows[2]]);
 assert.deepEqual(filterNewsItems(rows,'','draft'),[rows[1]]);
 assert.deepEqual(filterNewsItems(rows,'  КУБОК  ','all'),[rows[0]]);
 assert.deepEqual(filterNewsItems(rows,'отсутствует','all'),[]);
 assert.equal(JSON.stringify(rows),original);
});

test('PUSH editor detects unsaved changes without considering labels or mutating server snapshot',()=>{
 const source=[{key:'open',enabled:true,title:'Открыто',body:'Привет',label:'Открытие',description:'служебное'}];
 const clone=source.map(item=>({...item}));
 assert.equal(pushTemplatesChanged(source,clone),false);
 clone[0].label='Иной заголовок в описании';
 assert.equal(pushTemplatesChanged(source,clone),false);
 clone[0].body='Изменённое сообщение';
 assert.equal(pushTemplatesChanged(source,clone),true);
 assert.equal(source[0].body,'Привет');
});

test('journal stays read-only and offers local search, clear and reliable provider status',async()=>{
 const panel=await source('EmailJournalPanel.tsx');
 assert.match(panel,/filterMailJournalEntries\(entries,search\)/);
 assert.match(panel,/aria-label="Поиск по журналу писем"/);
 assert.match(panel,/Очистить поиск/);
 assert.match(panel,/Загружено записей/);
 assert.match(panel,/Не подтверждает доставку/);
 assert.doesNotMatch(panel,/apiDelete|message\.html|message\.text|rawToken|lastError/);
});

test('automatic PUSH editor exposes unsaved state and explicit discard, but never broadcasts on template save',async()=>{
 const panel=await source('NotificationsPage.tsx');
 assert.match(panel,/pushTemplatesChanged\(templateOriginal\.templates,templateDraft\)/);
 assert.match(panel,/Несохранённые изменения/);
 assert.match(panel,/Отменить изменения шаблонов/);
 assert.match(panel,/setTemplateDraft\(templateOriginal\.templates\.map/);
 assert.match(panel,/Сохранение не отправляет уведомления/);
 assert.match(panel,/setTitle\(""\)/);
});

test('news has reversible list filters without altering publication state or drafts',async()=>{
 const panel=await source('NewsPage.tsx');
 assert.match(panel,/filterNewsItems\(items,query,publicationFilter\)/);
 assert.match(panel,/aria-label="Поиск новостей"/);
 assert.match(panel,/aria-label="Статус публикации новости"/);
 assert.match(panel,/Сбросить фильтры новостей/);
 assert.match(panel,/newNewsDraft\(\)/);
 assert.match(panel,/switchNewsPublication/);
 assert.match(panel,/_newsRevision/);
});


test('partner filters distinguish published, drafts and hidden entries without publishing anything',()=>{
 const partners=[
  {id:'1',name:'Студия Север',tier:'STUDIO',isActive:true,isPublished:true},
  {id:'2',name:'Партнёр Юг',tier:'REGULAR',isActive:true,isPublished:false},
  {id:'3',name:'Скрытый бренд',tier:'PREMIUM',isActive:false,isPublished:true},
  {id:'4',name:'Исторический',tier:'GENERAL',isActive:true},
 ];
 assert.deepEqual(filterPartners(partners,'', 'all','visible'),[partners[0],partners[3]]);
 assert.deepEqual(filterPartners(partners,'','all','draft'),[partners[1]]);
 assert.deepEqual(filterPartners(partners,'','all','hidden'),[partners[2]]);
 assert.deepEqual(filterPartners(partners,' СЕВЕР ','STUDIO','all'),[partners[0]]);
 assert.deepEqual(filterPartners(partners,'','PREMIUM','all'),[partners[2]]);
 assert.equal(partners[1].isPublished,false);
});

test('partners desk exposes fast category and visibility filters while preserving revision guard',async()=>{
 const page=await source('PartnersPage.tsx');
 assert.match(page,/filterPartners\(partners,query,tierFilter,visibilityFilter\)/);
 assert.match(page,/aria-label="Поиск партнёров"/);
 assert.match(page,/aria-label="Категория партнёров"/);
 assert.match(page,/aria-label="Видимость партнёров"/);
 assert.match(page,/Сбросить фильтры партнёров/);
 assert.match(page,/_partnersRevision/);
});

test('long communication pages provide keyboard-friendly direct links to tools and journals',async()=>{
 const [notifications,templates,journal]=await Promise.all([
  source('NotificationsPage.tsx'),source('EmailTemplatesPage.tsx'),source('EmailJournalPanel.tsx'),
 ]);
 assert.match(notifications,/aria-label="Разделы PUSH-уведомлений"/);
 assert.match(notifications,/href="#push-templates"/);
 assert.match(notifications,/href="#push-composer"/);
 assert.match(notifications,/href="#push-history"/);
 assert.match(templates,/href="#mail-journal"/);
 assert.match(journal,/id="mail-journal"/);
});

test('queued PUSH stays acknowledged if only the subsequent history refresh fails',async()=>{
 const page=await source('NotificationsPage.tsx');
 assert.match(page,/Объявление поставлено в очередь, но историю не удалось обновить/);
 assert.match(page,/try\s*\{\s*await load\(\);\s*\}\s*catch/);
});
