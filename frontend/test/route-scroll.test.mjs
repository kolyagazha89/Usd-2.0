import test from 'node:test';
import assert from 'node:assert/strict';
import {liveRoutePath,routeScrollKey,routeScrollTarget} from '../src/navigation/route-scroll-model.ts';
test('stage selectors that replace the URL retain their actual selected stage',()=>{
 assert.equal(liveRoutePath('/admin/registrations?stageId=old',{pathname:'/admin/registrations',search:'?stageId=selected&view=entry'}),'/admin/registrations?stageId=selected&view=entry');
 assert.equal(liveRoutePath('/admin/records?view=record',{pathname:'/admin/cars',search:'?carId=car'}),'/admin/records?view=record');
});
test('new public pages start at the top even if visited previously',()=>{
 assert.equal(routeScrollTarget('/stages','push',1400,900),0);
 assert.equal(routeScrollTarget('/stages','pop',1400,900),900);
});
test('admin edits return to the previous record or list position',()=>{
 assert.equal(routeScrollTarget('/admin/participants','push',1400,0),1400);
 assert.equal(routeScrollTarget('/admin/participants','pop',1400,900),900);
 assert.notEqual(routeScrollKey('/admin/cars?carId=a'),routeScrollKey('/admin/cars?carId=b'));
 assert.equal(routeScrollKey('/admin/cars?carId=a&returnTo=x'),routeScrollKey('/admin/cars?carId=a'));
 assert.equal(routeScrollKey('/admin/stages?season=2025'),routeScrollKey('/admin/stages?season=2026'));
 for(const value of [NaN,-1,Infinity,undefined])assert.equal(routeScrollTarget('/admin/cars','push',value,undefined),0);
});
