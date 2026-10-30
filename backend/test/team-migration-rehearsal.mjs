// Run only on an explicitly created, empty, local synthetic PostgreSQL 18 database.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import pg from 'pg';
const baselineRef=process.env.USD_TEAMS_BASELINE_REF??'aa55edbf65ed5aa79272de5843dec27464165ed8';
const url=new URL(process.env.DATABASE_URL??'');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&(url.pathname==='/usd_teams_test'||/^\/usd_teams_rehearsal_[a-z0-9_]+$/.test(url.pathname)),'Refusing non-local/non-rehearsal database');
const db=new pg.Client({connectionString:url.toString()});await db.connect();
try{
 assert.match((await db.query('SHOW server_version')).rows[0].server_version,/^18\./);
 assert.equal(Number((await db.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0].count),0,'Rehearsal requires a fresh, empty database');
 const migrations=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../prisma/migrations');
 const target='20261030060000_team_commanders';
 // Rehearse this additive change on the current-main schema snapshot. Historical
 // migrations include enum-add-and-use SQL that cannot be replayed as one PG query.
 const scratch=await mkdtemp(path.join(tmpdir(),'usd-team-baseline-'));
 try {
  const schema=path.join(scratch,'baseline.prisma');
  await writeFile(schema,execFileSync('git',['show',baselineRef+':backend/prisma/schema.prisma']));
  const baseline=execFileSync('npx',['prisma','migrate','diff','--from-empty','--to-schema',schema,'--script'],{encoding:'utf8'});
  await db.query(baseline);
 } finally {await rm(scratch,{recursive:true,force:true})}
 await db.query(`INSERT INTO "Participant" (id,"firstName","lastName",team,"updatedAt") VALUES ('teams-rehearsal-sentinel','Synthetic','Migration','  Historic Team Unchanged  ',now())`);
 const before=(await db.query('SELECT row_to_json(p) AS data FROM "Participant" p')).rows;
 await db.query(await readFile(path.join(migrations,target,'migration.sql'),'utf8'));
 assert.deepEqual((await db.query('SELECT row_to_json(p) AS data FROM "Participant" p')).rows,before,'Existing participant fields must be byte-for-byte unchanged');
 for(const table of ['Team','TeamMembership','TeamPost'])assert.equal((await db.query(`SELECT count(*) FROM "${table}"`)).rows[0].count,'0','No linking or backfill during migration');
 await assert.rejects(db.query(`INSERT INTO "Team" (id,name,"nameKey","updatedAt") VALUES ('invalid','','',now())`));
 console.log('PostgreSQL 18 baseline → team migration passed; sentinel unchanged, three empty tables, storage constraints enforced.');
}finally{await db.end()}
