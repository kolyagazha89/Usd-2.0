import test from 'node:test';
import assert from 'node:assert/strict';
import {
 VENUE_ADMIN_HOME,venueAdminRouteAllowed,venueAdminMenuAllowed,venueEntryPath,
} from '../src/admin/venue-admin-mode.ts';

test('offline hub opens the familiar competition-day admin desk',()=>{
 for(const path of ['/', '/admin', '/admin/', '/participant', '/offline-event', '/admin/site-settings',
  '/admin/users', '/admin/venue-server', '/admin/import', '/admin/stages/edit?stageId=x']){
  assert.equal(venueEntryPath(path,true),VENUE_ADMIN_HOME,path);
 }
 assert.equal(venueEntryPath('/',false),'/');
 assert.equal(venueEntryPath('/admin/users',false),'/admin/users');
 assert.equal(venueEntryPath('/login?next=%2Fadmin%2Fevent-day',true),'/login?next=%2Fadmin%2Fevent-day');
 assert.equal(venueEntryPath('/venue/live',true),'/venue/live');
});
test('local competition screens and nested vehicle/configuration cards stay usable',()=>{
 for(const path of ['/admin/event-day','/admin/event-day?stageId=abc','/admin/registrations',
  '/admin/inspections','/admin/results','/admin/results/entry?stageId=a',
  '/admin/participants','/admin/participants/abc',
  '/admin/cars','/admin/cars/new','/admin/cars/edit?carId=abc',
  '/admin/cars/configurations?carId=abc']){
  assert.equal(venueAdminRouteAllowed(path),true,path);
  assert.equal(venueEntryPath(path,true),path,path);
 }
});
test('local stage details remain linkable but stage administration and unrelated modules are blocked',()=>{
 const id='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
 assert.equal(venueAdminRouteAllowed('/admin/stages/'+id),true);
 for(const path of ['/admin/stages','/admin/stages/new','/admin/stages/edit?stageId='+id,
  '/admin/stages/classes','/admin/news','/admin/roles','/admin/statistics',
  '/admin/participants-hijack','/admin/results2','/admin/event-day/../users',
  '/admin/event-day%2f..%2fusers','/admin/notifications','/admin/assistant']){
  assert.equal(venueAdminRouteAllowed(path),false,path);
  assert.equal(venueEntryPath(path,true),VENUE_ADMIN_HOME,path);
 }
});
test('venue navigation only shows operational work, production navigation is unchanged',()=>{
 const visible=['/admin/event-day','/admin/registrations','/admin/inspections',
  '/admin/results','/admin/participants','/admin/cars'];
 for(const path of visible)assert.equal(venueAdminMenuAllowed(path,true),true,path);
 for(const path of ['/admin','/admin/stages','/admin/inbox','/admin/venue-server',
  '/admin/news','/admin/users','/admin/records','/admin/data-quality'])
  assert.equal(venueAdminMenuAllowed(path,true),false,path);
 assert.equal(venueAdminMenuAllowed('/admin/inbox',false),true);
});
