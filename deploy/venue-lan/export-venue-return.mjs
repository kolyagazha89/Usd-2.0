#!/usr/bin/env node
/** Venue-only USB return export. Read-only, encrypted, signed; NEVER pushes
 * private data over HTTP and NEVER mutates central Ubuntu.
 */
import {createRequire} from 'node:module';
import {lstat,readFile,open,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertVenueDatabaseRole,assertVenueImportEnvironment} from './import-stage.mjs';
import {
 makeVenueReturnSnapshot,signVenueReturnSnapshot,encryptVenueReturn,
} from './venue-return-package.mjs';

const SHA=/^[a-f0-9]{64}$/;
const MAX_JOURNAL_ENTRIES=25000;
const chainQuery=`SELECT sequence,previous_hash AS "previousHash",hash,payload,
 encode(digest(previous_hash || payload::text,'sha256'),'hex') AS calculated
 FROM venue_private.operation_journal ORDER BY sequence LIMIT 25001`;

/** Read a consistent MVCC snapshot, not a moving stream of live mutations.
 * Source table is root-owned and read-only to the venue API principal.
 */
export async function collectVenueJournal(prisma,env,now=Date.now()){
 const stageId=env.VENUE_STAGE_ID;
 assertVenueImportEnvironment(env,stageId);
 return prisma.$transaction(async tx=>{
  await assertVenueDatabaseRole(tx);
  const stages=await tx.stage.findMany({select:{id:true},take:2});
  if(stages.length!==1||stages[0].id!==stageId)
   throw new Error('Должен быть только один закреплённый этап площадки');
  const baseline=await tx.auditLog.findFirst({
   where:{action:'VENUE_STAGE_PACKAGE_IMPORTED',entity:'Stage',entityId:stageId},
   select:{metadata:true},
  });
  const baselineSha256=baseline?.metadata?.sha256;
  if(typeof baselineSha256!=='string'||!SHA.test(baselineSha256))
   throw new Error('В базе нет подтверждённого импорта исходного этапа');
  const rows=await tx.$queryRawUnsafe(chainQuery);
  if(!Array.isArray(rows)||rows.length>MAX_JOURNAL_ENTRIES)
   throw new Error('Слишком много операций для ограниченного USB-пакета');
  const events=[];
  let previous='0'.repeat(64),lastSequence=0;
  for(const row of rows){
   const sequence=Number(row.sequence);
   if(!Number.isSafeInteger(sequence)||sequence<=lastSequence
    ||row.previousHash!==previous||row.calculated!==row.hash
    ||typeof row.hash!=='string'||!SHA.test(row.hash))
    throw new Error('Нарушена целостность локального журнала: экспорт запрещён');
   events.push({
    sequence,previousHash:row.previousHash,hash:row.hash,payload:row.payload,
   });
   previous=row.hash;lastSequence=sequence;
  }
  return makeVenueReturnSnapshot({
   stageId,baselineSha256,events,generatedAt:new Date(now).toISOString(),
  });
 },{isolationLevel:'RepeatableRead',timeout:30000});
}
async function readPrivateKeySecure(file){
 const info=await lstat(file);
 if(!info.isFile()||(info.mode&0o077)!==0)
  throw new Error('Файл Ed25519 должен быть обычным файлом с правами 0600');
 return readFile(file,'utf8');
}
async function stdinPassphrase(){
 let secret='';
 for await(const chunk of process.stdin){
  secret+=chunk.toString('utf8');
  if(secret.length>4096)throw new Error('Слишком длинная фраза');
 }
 return secret.replace(/\r?\n$/,'');
}
async function saveExclusive(file,content){
 const handle=await open(file,'wx',0o600);
 let success=false;
 try{await handle.writeFile(content,'utf8');await handle.sync();success=true}
 finally{
  await handle.close();
  if(!success)await unlink(file).catch(()=>{});
 }
}
async function main(){
 const [privateKeyFile,outputFile,...extra]=process.argv.slice(2);
 if(!privateKeyFile||!outputFile||extra.length)
  throw new Error('Usage: export-venue-return.mjs PRIVATE_KEY.pem OUTPUT.json');
 const key=await readPrivateKeySecure(privateKeyFile);
 const passphrase=await stdinPassphrase();
 const require=createRequire(import.meta.url);
 const {PrismaPg}=require('@prisma/adapter-pg');
 const {PrismaClient}=require('/app/dist/generated/prisma/client.js');
 const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{
  const snapshot=await collectVenueJournal(prisma,process.env);
  const signed=signVenueReturnSnapshot(snapshot,key);
  const sealed=encryptVenueReturn(signed,passphrase);
  await saveExclusive(outputFile,JSON.stringify(sealed)+'\n');
  process.stdout.write('USD VENUE USB RETURN CREATED (ENCRYPTED, NOT SYNCED)\n');
  process.stdout.write(JSON.stringify({
   stageId:snapshot.stageId,
   baselineSha256:snapshot.baselineSha256,
   eventCount:snapshot.eventCount,
   journalEndHash:snapshot.journalEndHash,
   packageSha256:signed.integrity.sha256,
  })+'\n');
 }finally{await prisma.$disconnect()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{
  console.error('USD VENUE EXPORT REFUSED: verify role, signatures, journal, key permissions, file and password');
  process.exitCode=1;
 });
}
