import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=path=>readFile(new URL(path,import.meta.url),'utf8');
test('venue journal logs all competition mutations and never stores credentials',async()=>{
 const sql=await source('./install-journal.sql');
 const required=['Participant','Car','Registration','RegistrationNumber',
  'RegistrationClass','Inspection','ParticipantStageInspection',
  'RegistrationClassInspection','Result','Disqualification',
  'CarConfiguration','CarConfigurationVersion'];
 for(const table of required)assert.match(sql,new RegExp("'"+table+"'"));
 for(const excluded of ["'User'","'RefreshSession'","'Role'","'EmailVerificationToken'"])
  assert.ok(!sql.includes(excluded),'No auth secrets in judge mutation journal');
 assert.match(sql,/SECURITY DEFINER SET search_path/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/previous_hash/);
 assert.match(sql,/digest\(v_previous \|\| v_payload::text/);
 assert.match(sql,/GRANT SELECT ON venue_private\.operation_journal TO usd_venue/);
 assert.doesNotMatch(sql,/GRANT (?:ALL|INSERT|UPDATE|DELETE) ON venue_private\.operation_journal TO usd_venue/);
});
test('no API writes allowed unless offline journal was installed and triggers are active',async()=>{
 const [prisma,bootstrap,workflow]=await Promise.all([
  source('../../backend/src/prisma/prisma.service.ts'),
  source('./bootstrap-local-stage.sh'),
  source('../../.github/workflows/venue-db-acceptance.yml'),
 ]);
 assert.match(prisma,/journal\[0\]\.count!==18/);
 assert.match(bootstrap,/install-journal\.sql/);
 assert.match(workflow,/Install trusted append-only venue write journal/);
});
