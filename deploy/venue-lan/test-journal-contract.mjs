import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=path=>readFile(new URL(path,import.meta.url),'utf8');
test('venue journal logs all competition mutations and never stores credentials',async()=>{
 const sql=await source('./install-journal.sql');
 const required=['Participant','Car','Registration','RegistrationNumber',
  'RegistrationClass','Inspection','ParticipantStageInspection',
  'RegistrationClassInspection','Result','Disqualification',
  'CarConfiguration','CarConfigurationVersion','CarAmplifierComponent'];
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
 assert.match(prisma,/journal\[0\]\.count!==19/);
 assert.match(bootstrap,/install-journal\.sql/);
 assert.match(workflow,/Install trusted append-only venue write journal/);
});

test('upgrade journals amplifier links without falsely backdating completeness',async()=>{
 const upgrade=await source('./upgrade-journal-links.sql');
 assert.match(upgrade,/CREATE OR REPLACE FUNCTION venue_private\.capture_change/);
 assert.match(upgrade,/CREATE TRIGGER usd_venue_caramplifiercomponent_journal/);
 assert.match(upgrade,/SELECT coalesce\(\(SELECT max\(sequence\) FROM venue_private\.operation_journal\),0\)\s+WHERE NOT EXISTS/);
 assert.doesNotMatch(upgrade,/FROM venue_private\.operation_journal\s+WHERE NOT EXISTS/);
 assert.match(upgrade,/WHERE NOT EXISTS \(SELECT 1 FROM venue_private\.journal_coverage\)/);
 assert.doesNotMatch(upgrade,/TRUNCATE|DROP TABLE|DELETE FROM venue_private\.operation_journal/);
});

test('coverage watermark stays unique after stage switches and duplicate repair is fail-closed',async()=>{
 const [initial,upgrade,repair]=await Promise.all([
  source('./install-journal.sql'),
  source('./upgrade-journal-links.sql'),
  source('./repair-journal-coverage.sql'),
 ]);
 for(const sql of [initial,upgrade,repair]){
  assert.match(sql,/CREATE UNIQUE INDEX(?: IF NOT EXISTS)? usd_venue_journal_coverage_singleton/);
  assert.match(sql,/ON venue_private\.journal_coverage \(\(true\)\)/);
 }
 assert.match(repair,/current_user <> 'usd_venue_root'/);
 assert.match(repair,/current_database\(\) <> 'usd_venue'/);
 assert.match(repair,/LOCK TABLE venue_private\.journal_coverage IN ACCESS EXCLUSIVE MODE/);
 assert.match(repair,/format_version <> 2 OR from_sequence <> 0/);
 assert.match(repair,/ORDER BY installed_at, ctid/);
 assert.doesNotMatch(repair,/(?:DELETE|TRUNCATE|UPDATE)\s+(?:FROM\s+)?venue_private\.operation_journal/);
});

test('one-click Windows repair backs up DB and checks coverage before every upgrade',async()=>{
 const [control,season,coverage,kit]=await Promise.all([
  source('./venue-control.ps1'),source('./venue-season.ps1'),
  source('./venue-coverage.ps1'),source('./build-windows-kit.py'),
 ]);
 assert.match(control,/Repair-VenueCoverageIfNeeded\s+Get-Content -LiteralPath \(Join-Path \$Root 'upgrade-journal-links\.sql'\)/);
 assert.match(season,/Repair-VenueCoverageIfNeeded\s+Get-Content -LiteralPath \(Join-Path \$Root 'upgrade-journal-links\.sql'\)/);
 assert.match(control,/if\(\$journalFile -eq 'upgrade-journal-links\.sql'\)\{Repair-VenueCoverageIfNeeded\}/);
 assert.match(control,/venue-coverage\.ps1/);
 assert.match(season,/'venue-coverage\.ps1'/);
 assert.match(kit,/"venue-coverage\.ps1"/);
 assert.match(coverage,/pg_dump/);
 assert.match(coverage,/pg_restore/);
 assert.match(coverage,/Get-FileHash -LiteralPath \$filename -Algorithm SHA256/);
 assert.match(coverage,/\$all -ne \$valid/);
 assert.match(coverage,/DirectorySecurity/);
 assert.match(coverage,/SpecialFolder\]::LocalApplicationData/);
 assert.doesNotMatch(coverage,/Join-Path \$PrivateDir 'db-backups'/);
 assert.match(coverage,/Restore-VenueApi/);
 assert.ok(coverage.indexOf('pg_dump')<coverage.indexOf('Get-Content -LiteralPath $sql'));
});
