import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=(name)=>readFile(new URL('../../deploy/venue-lan/'+name,import.meta.url),'utf8');

test('LIVE is a distinct TV container: judges and the existing API retain their pinned images',async()=>{
 const compose=await source('compose.yaml');
 assert.match(compose,/api:[\s\S]*?usd-2\.0-api:\$\{VENUE_IMAGE_TAG/);
 assert.match(compose,/frontend:[\s\S]*?usd-2\.0-frontend:\$\{VENUE_IMAGE_TAG/);
 assert.match(compose,/\n  tv:\n[\s\S]*?usd-2\.0-frontend:\$\{VENUE_TV_IMAGE_TAG/);
 assert.match(compose,/\n  tv:\n[\s\S]*?create_host_path: false/);
});

test('the LAN spectator HTTP is served from the independently updated TV image, never judges frontend',async()=>{
 const caddy=await source('Caddyfile');
 const tv=caddy.split('http://{$VENUE_BIND_IP} {')[1];
 assert.ok(tv);
 for(const resource of ['/venue/live','/assets/*','/usd-venue-config.js']){
  assert.ok(tv.includes('handle '+resource+' {\n    reverse_proxy tv:80'),'HTTP '+resource+' still serves old frontend');
 }
 assert.match(caddy,/https:\/\/\{\$VENUE_BIND_IP\} \{[\s\S]*?handle \/venue\/live \{\s*redir http:\/\//);
 assert.match(tv,/path \/venue-api\/results\/venue-live[\s\S]*?method GET/);
 assert.doesNotMatch(tv,/handle_path \/venue-api\/\*/);
});

test('reinstalling a READY real stage refreshes TV only without touching database, API or stage identity',async()=>{
 const manager=await source('venue-control.ps1');
 assert.match(manager,/if\(\$state\.phase -eq 'READY'\)\{Update-ReadyVenueTv \$state;Start-Local;return\}/);
 const start=manager.indexOf('function Update-ReadyVenueTv');
 const end=manager.indexOf('\nfunction ',start+10);
 assert.ok(start>0 && end>start);
 const upgrade=manager.slice(start,end);
 assert.match(upgrade,/VENUE_TV_IMAGE_TAG/);
 assert.match(upgrade,/--no-deps/);
 assert.match(upgrade,/tv','gateway/);
 assert.doesNotMatch(upgrade,/@\('down'|--volumes|migrate','deploy'|stop','api|up','-d','db/);
});

test('a new installation checks the current release before falling back to an already cached version',async()=>{
 const season=await source('venue-season.ps1');
 const release=season.slice(season.indexOf('function Get-VenueReleaseSha'),season.indexOf('function Get-VenueReleaseSha')+3500);
 assert.ok(release.indexOf('Get-OnlineVenueReleaseSha')>=0);
 assert.ok(release.indexOf('Get-OnlineVenueReleaseSha')<release.indexOf('Get-CachedVenueReleaseSha'),
  'old locally cached images are chosen before the new release');
});
