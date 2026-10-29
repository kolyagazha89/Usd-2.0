import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PUBLIC_NAVIGATION,editablePublicNavigationItems,footerPublicNavigationGroups,visiblePublicNavigationItems} from '../src/public/navigation-model.ts';

test('legacy navigation defaults to all USD public sections',()=>{
 assert.equal(visiblePublicNavigationItems({items:[]}).length,DEFAULT_PUBLIC_NAVIGATION.filter(item=>item.enabled).length);
 assert.equal(visiblePublicNavigationItems({items:[]}).some(([path])=>path==='/partners'),false);
 assert.deepEqual(visiblePublicNavigationItems(undefined)[0],['/','Главная']);
});
test('CMS can hide all menu links without silently restoring defaults',()=>{
 const rows=DEFAULT_PUBLIC_NAVIGATION.map(item=>({...item,enabled:false}));
 assert.deepEqual(visiblePublicNavigationItems({items:rows}),[]);
 assert.equal(editablePublicNavigationItems({items:rows}).length,rows.length);
});
test('CMS menu preserves renamed labels and custom order, and rejects unknown links in the public view',()=>{
 const rows=[
 {id:'news',path:'/news',label:'Журнал',enabled:true,sortOrder:2},
 {id:'bad',path:'javascript:alert(1)',label:'Bad',enabled:true,sortOrder:0},
 {id:'stages',path:'/stages',label:'Афиша',enabled:true,sortOrder:1},
 {id:'duplicate',path:'/stages',label:'Подмена',enabled:true,sortOrder:0},
 {id:'rules',path:'/rules',label:'Правила',enabled:false,sortOrder:3},
 ];
 assert.deepEqual(visiblePublicNavigationItems({items:rows}),[['/stages','Афиша'],['/news','Журнал']]);
 const editable=editablePublicNavigationItems({items:rows});
 assert.equal(editable.length,DEFAULT_PUBLIC_NAVIGATION.length);
 assert.equal(editable.find(item=>item.path==='/')?.enabled,false);
});


test('footer uses CMS labels, order and visibility instead of hard-coded extra routes',()=>{
 const rows=[
  {id:'partners',path:'/partners',label:'Наши спонсоры',enabled:false,sortOrder:0},
  {id:'news',path:'/news',label:'Журнал USD',enabled:true,sortOrder:1},
  {id:'results',path:'/results',label:'Таблица результатов',enabled:true,sortOrder:2},
  {id:'stages',path:'/stages',label:'Календарь',enabled:true,sortOrder:3},
  {id:'rules',path:'/rules',label:'Правила',enabled:false,sortOrder:4},
  {id:'contacts',path:'/contacts',label:'Связаться',enabled:true,sortOrder:5},
 ];
 assert.deepEqual(footerPublicNavigationGroups({items:rows}),{
  competitions:[['/results','Таблица результатов'],['/stages','Календарь']],
  community:[['/news','Журнал USD']],
  information:[['/contacts','Связаться']],
 });
 const hidden=DEFAULT_PUBLIC_NAVIGATION.map(item=>({...item,enabled:false}));
 assert.deepEqual(footerPublicNavigationGroups({items:hidden}),{competitions:[],community:[],information:[]});
 const legacy=footerPublicNavigationGroups({items:[]});
 assert.equal(legacy.community.some(([path])=>path==='/partners'),false);
 assert.equal(legacy.competitions.some(([path])=>path==='/stages'),true);
});

test('public footer renders CMS menu groups without hiding mandatory legal documents',async()=>{
 const {readFile}=await import('node:fs/promises');
 const shell=await readFile(new URL('../src/public/PremiumShell.tsx',import.meta.url),'utf8');
 assert.match(shell,/footerPublicNavigationGroups\(settings\?\.navigation\)/);
 for(const group of ['competitions','community','information'])assert.match(shell,new RegExp('footerLinks\\.'+group+'\\.map'));
 for(const legal of ['/privacy','/terms','/consent'])assert.ok(shell.includes("'"+legal+"'"));
 assert.doesNotMatch(shell,/const mainLinks=visiblePublicNavigationItems/);
});
