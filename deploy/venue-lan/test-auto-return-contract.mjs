import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
test('stage export grants stage-scoped capability and CLI has one-click sync',async()=>{
 const [stage,ctl]=await Promise.all([read('../../backend/src/stages/venue-stage.service.ts'),read('venue-control.ps1')]);
 assert.match(stage,/syncAuthorization/);
 assert.match(stage,/tokenHash/);
 assert.match(ctl,/function Sync-VenueReturn/);
 assert.match(ctl,/Export-VenueReturn -LeaveApiStopped -Automatic/);
});
test('no online switch until signed ACK includes exact journal hash and derived results',async()=>{
 const ctl=await read('venue-control.ps1');
 const section=ctl.slice(ctl.indexOf('function Return-Online'),ctl.indexOf('if($MyInvocation.InvocationName'));
 assert.ok(section.indexOf('Sync-VenueReturn')<section.indexOf('Remove-Autostart'));
 assert.match(ctl,/SyncResult\.journalEndHash -ne \$Bundle\.journalEndHash/);
 assert.match(ctl,/SyncResult\.derivedRankingsRebuilt -ne \$true/);
 assert.match(section,/Restore-VenueApi/);
 assert.match(ctl,/if\(\$state\.demo\)/);
});
test('signed grant is protected on Windows and central secrets never copied to venue',async()=>{
 const ctl=await read('venue-control.ps1');
 assert.match(ctl,/Write-PrivateFile \$privateStage/);
 assert.doesNotMatch(ctl,/VENUE_PRODUCTION_DATABASE_URL|VENUE_PRODUCTION_JWT_SECRET/);
});
