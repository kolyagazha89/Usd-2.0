import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=(name)=>readFile(new URL('../../deploy/venue-lan/'+name,import.meta.url),'utf8');

test('one frontend serves both judges and LIVE; no extra TV container',async()=>{
 const compose=await source('compose.yaml');
 assert.match(compose,/\n  frontend:\n[\s\S]*?usd-2\.0-frontend:\$\{VENUE_WEB_IMAGE_TAG:-\$\{VENUE_IMAGE_TAG/);
 assert.doesNotMatch(compose,/\n  tv:\n/);
 assert.match(compose,/\n  api:\n[\s\S]*?usd-2\.0-api:\$\{VENUE_IMAGE_TAG/);
 assert.match(compose,/depends_on: \[frontend,api\]/);
});

test('both HTTP LIVE and authenticated HTTPS share the same frontend, judging only over HTTPS',async()=>{
 const caddy=await source('Caddyfile');
 const tv=caddy.split('http://{$VENUE_BIND_IP} {')[1];
 assert.ok(tv);
 for(const resource of ['/venue/live','/assets/*','/usd-venue-config.js']){
  assert.ok(tv.includes('handle '+resource+' {\n    reverse_proxy frontend:80'),'HTTP '+resource+' must be served by the normal frontend');
 }
 assert.doesNotMatch(caddy,/reverse_proxy tv:80/);
 assert.match(caddy,/https:\/\/\{\$VENUE_BIND_IP\} \{[\s\S]*?handle \/venue\/live \{\s*redir http:\/\//);
 assert.match(tv,/path \/venue-api\/results\/venue-live[\s\S]*?method GET/);
 assert.doesNotMatch(tv,/handle_path \/venue-api\/\*/);
});

test('reinstalling a READY stage refreshes the existing frontend but leaves database and API pinned',async()=>{
 const manager=await source('venue-control.ps1');
 assert.match(manager,/if\(\$state\.phase -eq 'READY'\)\{Update-ReadyVenueFrontend \$state;Start-Local;return\}/);
 const start=manager.indexOf('function Update-ReadyVenueFrontend');
 const end=manager.indexOf('\nfunction ',start+10);
 assert.ok(start>0 && end>start);
 const upgrade=manager.slice(start,end);
 assert.match(upgrade,/VENUE_WEB_IMAGE_TAG/);
 assert.match(upgrade,/--no-deps/);
 assert.match(upgrade,/'frontend','gateway'/);
 assert.doesNotMatch(upgrade,/--volumes|migrate','deploy'|stop','api|up','-d','db/);
 assert.doesNotMatch(upgrade,/'tv'|VENUE_TV_IMAGE_TAG/);
});

test('a new installation checks the current release before falling back to cached images',async()=>{
 const season=await source('venue-season.ps1');
 const release=season.slice(season.indexOf('function Get-VenueReleaseSha'),season.indexOf('function Get-VenueReleaseSha')+3500);
 assert.ok(release.indexOf('Get-OnlineVenueReleaseSha')>=0);
 assert.ok(release.indexOf('Get-OnlineVenueReleaseSha')<release.indexOf('Get-CachedVenueReleaseSha'));
});
