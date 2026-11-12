import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {postgresFullVenueAdapter} from './venue-full-adapter.mjs';
import {applyCompleteVenueJournal} from '../../deploy/venue-lan/full-return-apply.mjs';
import {FULL_RETURN_COVERAGE_TABLES} from '../../deploy/venue-lan/venue-return-package.mjs';

const url=process.env.VENUE_CENTRAL_TEST_DATABASE_URL;
if(!url||!url.includes('/usd_venue_ci'))throw Error('Only isolated usd_venue_ci PG18 permitted');
const client=new pg.Client({connectionString:url});
const uid=n=>'c510f672-79f7-44eb-8173-'+n.toString(16).padStart(12,'0');
const stage=uid(1),season=uid(2),direction=uid(3),cls=uid(4);
const participant=uid(21),car=uid(22),config=uid(23),version=uid(24),
 registration=uid(25),number=uid(26),regclass=uid(27),inspection=uid(28),result=uid(29);
const opts={stageId:stage,baselineSha256:'a'.repeat(64),apply:true,operator:'CI admin'};
const hash=n=>n.toString(16).padStart(64,'0');
async function query(sql,values=[]){return client.query(sql,values)}
let changes;
async function read(table,id){
 return (await query('SELECT to_jsonb(t) AS row FROM "'+table+'" t WHERE id=$1',[id])).rows[0]?.row??null;
}
async function createFixtures(numberValue=42){
 const events=[],ids=[
  ['Participant',participant],['Car',car],['CarConfiguration',config],
  ['CarConfigurationVersion',version],['Registration',registration],
  ['RegistrationNumber',number],['RegistrationClass',regclass],
  ['Inspection',inspection],['Result',result],
 ];
 await query('BEGIN');
 try{
  await query('INSERT INTO "Participant"(id,"firstName","lastName",city) VALUES ($1,$2,$3,$4)',
   [participant,'Новый','Участник','Омск']);
  await query('INSERT INTO "Car"(id,"participantId",brand,model,"registrationNumber") VALUES ($1,$2,$3,$4,$5)',
   [car,participant,'Lada','Vesta','А123АА181']);
  await query('INSERT INTO "CarConfiguration"(id,"carId",name) VALUES ($1,$2,$3)',[config,car,'SPL']);
  await query('INSERT INTO "CarConfigurationVersion"(id,"configurationId",version) VALUES ($1,$2,1)',
   [version,config]);
  await query('INSERT INTO "Registration"(id,"stageId","participantId","carId","configurationVersionId","configurationSnapshot","participantNumber",source) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)',
   [registration,stage,participant,car,version,'{}',numberValue,'ON_SITE']);
  await query('INSERT INTO "RegistrationNumber"(id,"stageId","registrationId",number,"isPrimary") VALUES ($1,$2,$3,$4,true)',
   [number,stage,registration,numberValue]);
  await query('INSERT INTO "RegistrationClass"(id,"registrationId","classId","numberId") VALUES ($1,$2,$3,$4)',
   [regclass,registration,cls,number]);
  await query('INSERT INTO "Inspection"(id,"registrationId",status,"checkedByName") VALUES ($1,$2,$3,$4)',
   [inspection,registration,'PASSED','Judge One']);
  await query('INSERT INTO "Result"(id,"registrationId","registrationClassId",value,unit,place,"isBest") VALUES ($1,$2,$3,$4,$5,$6,$7)',
   [result,registration,regclass,'154.120','DB',1,false]);
  let n=0;
  for(const [table,id] of ids){
   const after=await read(table,id);
   const sequence=++n;
   events.push({sequence,previousHash:hash(n-1),hash:hash(n),payload:{
    sequence,stageId:stage,table,recordId:id,operation:'INSERT',
    before:null,after,recordedAt:'2026-11-12T12:00:00.000Z',
   }});
  }
 }finally{await query('ROLLBACK')}
 return {format:2,journalCoverage:{fromSequence:0,tables:FULL_RETURN_COVERAGE_TABLES},stageId:stage,baselineSha256:opts.baselineSha256,
  journalEndHash:events.at(-1).hash,eventCount:events.length,events};
}
test.before(async()=>{
 await client.connect();
 assert.equal((await query('SELECT current_database() AS name')).rows[0].name,'usd_venue_ci');
 await query('INSERT INTO "Season"(id,name,year,status) VALUES ($1,$2,$3,$4)',
  [season,'Venue 2026',2026,'ACTIVE']);
 await query('INSERT INTO "Stage"(id,"seasonId","stageNumber",name,date,status) VALUES ($1,$2,$3,$4,$5,$6)',
  [stage,season,1,'Offline test','2026-11-12','PUBLISHED']);
 await query('INSERT INTO "Direction"(id,name) VALUES ($1,$2)',[direction,'SPL']);
 await query('INSERT INTO "Class"(id,"directionId",code,name,unit) VALUES ($1,$2,$3,$4,$5)',
  [cls,direction,'VENUE_INTEGRATION','SPL 1','DB']);
 await query('INSERT INTO "StageClass"(id,"stageId","classId") VALUES ($1,$2,$3)',
  [uid(5),stage,cls]);
 changes=await createFixtures();
});
test.after(async()=>await client.end());

test('PG18: full offline entrants, configs, number, inspection and result write atomically',async()=>{
 const adapter=postgresFullVenueAdapter(client);
 const preview=await applyCompleteVenueJournal(changes,adapter,{...opts,apply:false});
 assert.equal(preview.readyEvents,9);
 assert.equal(await read('Participant',participant),null);
 const outcome=await applyCompleteVenueJournal(changes,adapter,opts);
 assert.equal(outcome.appliedEvents,9);
 assert.equal(outcome.databaseSynchronized,true);
 assert.equal((await read('RegistrationNumber',number)).number,42);
 assert.equal((await read('Result',result)).value,154.12);
 assert.equal((await query('SELECT count(*)::int AS n FROM "AuditLog" WHERE action=$1',
  ['VENUE_FULL_EVENT_IMPORTED'])).rows[0].n,9);
 const replay=await applyCompleteVenueJournal(changes,adapter,opts);
 assert.equal(replay.alreadyApplied,true);
 assert.equal(replay.appliedEvents,0);
});
test('PG18: incompatible new event or stolen number cannot produce partial writes',async()=>{
 const adapter=postgresFullVenueAdapter(client);
 const conflicting=structuredClone(changes);
 conflicting.events[5].payload.after.number=42;
 conflicting.events[0].payload.after.id=uid(99);
 conflicting.events[0].payload.recordId=uid(99);
 // A changed journal is a different upload, not silently re-acknowledged.
 conflicting.journalEndHash='d'.repeat(64);
 await assert.rejects(()=>applyCompleteVenueJournal(conflicting,adapter,opts),/CONFLICT/);
 assert.equal(await read('Participant',uid(99)),null);
});
