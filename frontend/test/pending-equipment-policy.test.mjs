import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {overdueEquipment,isUndocumentedEquipment} from '../src/participant/pending-equipment-policy.ts';

const date='2026-10-01T15:00:00Z';
const pending=(extra={})=>({
 id:'registration-1',stageId:'old-stage',status:'ACTIVE',
 stage:{id:'old-stage',date,isDeleted:false},
 configurationSnapshot:{configurationPending:true},...extra,
});
const now=new Date('2026-11-02T12:00:00Z');

test('malformed completion snapshots do not silently clear the next-stage restriction',()=>{
 assert.equal(isUndocumentedEquipment({configurationPending:true,postStageCompletion:{versionId:42}}),true);
 assert.equal(isUndocumentedEquipment({configurationPending:true,postStageCompletion:{versionId:' '}}),true);
 assert.equal(isUndocumentedEquipment({configurationPending:true,postStageCompletion:{versionId:'actual'}}),false);
 assert.equal(isUndocumentedEquipment({configurationPending:true,postStageCompletion:null}),true);
 assert.equal(isUndocumentedEquipment({configurationPending:false}),false);
 assert.equal(isUndocumentedEquipment(null),false);
});

test('the next different stage requires post-event equipment',()=>{
 assert.equal(overdueEquipment([pending()], 'new-stage', now)?.id,'registration-1');
 assert.equal(overdueEquipment([pending()], 'old-stage', now),null,'same stage is never blocked');
 assert.equal(overdueEquipment([pending({status:'CANCELLED'})],'new-stage',now),null);
 assert.equal(overdueEquipment([pending({stage:{date,isDeleted:true}})],'new-stage',now),null);
});
test('no pre-event gate and no gate for documented equipment',()=>{
 assert.equal(overdueEquipment([pending({stage:{date:'2026-12-01T15:00:00Z'}})],'new-stage',now),null);
 assert.equal(overdueEquipment([pending({configurationSnapshot:{configurationPending:false}})],'new-stage',now),null);
 assert.equal(overdueEquipment([pending({configurationSnapshot:{configurationPending:true,postStageCompletion:{versionId:'actual-2'}}})],'new-stage',now),null);
 assert.equal(overdueEquipment([pending({configurationSnapshot:{configurationPending:true,postStageCompletion:{versionId:' '}}})],'new-stage',now)?.id,'registration-1');
 assert.equal(overdueEquipment([pending({stage:{date:'garbage'}})],'new-stage',now),null,'invalid dates must not falsely block');
});
test('first unresolved past registration is shown so the participant has an actionable target',()=>{
 const rows=[pending({id:'old',configurationSnapshot:{configurationPending:true,postStageCompletion:{versionId:'v3'}}}),pending({id:'required',carId:'car-22'})];
 assert.equal(overdueEquipment(rows,'new-stage',now)?.id,'required');
});

test('account and entry flow expose actionable next-stage guard, while backend remains authoritative',async()=>{
 const [app,panel]=await Promise.all([
  readFile(new URL('../src/App.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/participant/PendingEquipment.tsx',import.meta.url),'utf8'),
 ]);
 assert.match(app,/overdueEquipment\(registrations,stage\.id\)/,'the first stage-action checks outstanding equipment');
 assert.match(app,/overdueEquipment\(registrations,s\.id\)/,'stage-list actions explain disabled registration');
 assert.match(app,/PREVIOUS_CONFIGURATION_REQUIRED/,'a stale client still handles a backend conflict');
 assert.match(app,/tab==='overview'&&!loading&&overdueEquipment\(registrations\)/,'the missing configuration is visible on account home');
 assert.match(app,/tab==='registrations'.*?overdueEquipment\(registrations\)/,'the member can find the pending requirement in registrations');
 assert.match(panel,/\/participant\/configurations\?carId=/);
 assert.match(panel,/apiPatch\('\/registrations\/'\+encodeURIComponent\(registration\.id\)\+'\/configuration'/);
 assert.match(panel,/isUndocumentedEquipment\(registration\.configurationSnapshot\)/);
 assert.match(panel,/setOptions\(found\);setVersionId\(''\)/,'participant must explicitly select the recorded configuration');
});

test('a saved gate draft opens a clean editable configuration, not an internal database sentinel',async()=>{
 const editor=await readFile(new URL('../src/admin/ConfigurationsPage.tsx',import.meta.url),'utf8');
 assert.match(editor,/additionalDescription:initial\.additionalDescription==='USD_ON_SITE_DRAFT_PENDING'\?'':withoutBoxLine/);
 assert.match(editor,/boxFromDescription\(initial\.additionalDescription==='USD_ON_SITE_DRAFT_PENDING'\?'':initial\.additionalDescription\?\?''\)/);
 assert.match(editor,/Ожидает заполнения после этапа/);
});
