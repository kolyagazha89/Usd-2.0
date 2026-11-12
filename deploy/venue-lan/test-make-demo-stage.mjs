import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createVenueDemo,writeVenueDemo} from './make-demo-stage.mjs';
import {verifyVenueStageHandoff} from './verify-stage-package.mjs';
import {planVenueStageImport} from './import-stage.mjs';

test('offline demo packet is a real Ed25519 signed, legal-complete one-stage fixture',()=>{
 const generated=createVenueDemo(new Date('2026-11-12T10:00:00Z'));
 const {signed,publicPem,stageId,fingerprint}=generated;
 const verified=verifyVenueStageHandoff(signed,publicPem,Date.parse('2026-11-12T10:00:00Z'));
 assert.equal(verified.stageId,stageId);
 assert.equal(verified.publicKeyFingerprint,fingerprint);
 assert.equal(signed.snapshot.stage.season.status,'ACTIVE');
 assert.equal(signed.snapshot.stage.registrationOpen,true);
 assert.ok(signed.snapshot.venuePolicy.legal.legalApproved);
 assert.ok(signed.snapshot.venuePolicy.rulesPublished.blocks.length);
 assert.ok(signed.snapshot.stage.stageClasses.length>=4);
 assert.ok(signed.snapshot.registrations[0].inspection.status==='PASSED');
 assert.ok(signed.snapshot.registrations[0].results.length>=1);
 assert.equal(signed.snapshot.stage.rulesSnapshot.demo,true);
 const serialized=JSON.stringify(signed);
 assert.doesNotMatch(serialized,/PRIVATE KEY|passwordHash|smtpPassword|refreshToken/);
 const plan=planVenueStageImport(signed,publicPem,{
  USD_VENUE_LAN_MODE:'true',VENUE_STAGE_ID:stageId,
  VENUE_SIGNING_KEY_FINGERPRINT:fingerprint,
  DATABASE_URL:'postgresql://usd_venue:correct-password@db:5432/usd_venue?schema=public',
  VENUE_DB_NAME:'usd_venue',VENUE_DB_USER:'usd_venue',VENUE_DB_PASSWORD:'correct-password',
 },Date.parse('2026-11-12T10:00:00Z'));
 assert.ok(plan.summary.classes>=4);
 assert.equal(plan.summary.registrations,1);
 assert.equal(plan.summary.results,1);
});
test('demo-only files are exclusive, owner-only, and cannot overwrite a test session',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'usd-venue-demo-test-'));
 t.after(async()=>rm(temp,{recursive:true,force:true}));
 const directory=join(temp,'first');
 await writeVenueDemo(directory,new Date('2026-11-12T10:00:00Z'));
 assert.deepEqual((await readdir(directory)).sort(),[
  'demo-info.txt','signing-public.pem','usd-venue-demo-stage.json',
 ]);
 const raw=await readFile(join(directory,'usd-venue-demo-stage.json'),'utf8');
 assert.match(raw,/USD ДЕМО/);
 assert.doesNotMatch(raw,/PRIVATE KEY/);
 await assert.rejects(()=>writeVenueDemo(directory),/exist|существ|EEXIST/i);
 const blocked=join(temp,'occupied');
 await mkdir(blocked);
 await assert.rejects(()=>writeVenueDemo(blocked),/exist|существ|EEXIST/i);
});
