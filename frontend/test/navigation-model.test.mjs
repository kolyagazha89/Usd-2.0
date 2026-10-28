import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PUBLIC_NAVIGATION,editablePublicNavigationItems,visiblePublicNavigationItems} from '../src/public/navigation-model.ts';

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
