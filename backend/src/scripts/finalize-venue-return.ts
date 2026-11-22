import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ResultsRankingService } from '../results/results-ranking.service';
import { RecordsService } from '../records/records.service';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Idempotent derived-data rebuild following a signed central import.
 * Works after a lost HTTP/CLI response: accepted audit receipts are durable.
 * This does NOT publish the stage or acknowledge unsupported journal events.
 */
export async function finalizeVenueStage(stageId: string, connectionString: string) {
  if (!UUID.test(stageId) || !connectionString) {
    throw new Error('Нужны проверенный stageId и центральная DATABASE_URL');
  }
  const prisma=new PrismaClient({adapter:new PrismaPg({connectionString})});
  try {
    const database=await prisma.$queryRawUnsafe<Array<{dbname:string}>>(
      'SELECT current_database() AS dbname');
    if (/^usd_venue(?:_|$)/.test(database[0]?.dbname??'')) {
      throw new Error('Нельзя пересчитывать локальную базу вместо центральной');
    }
    const stage=await prisma.stage.findUnique({
      where:{id:stageId},
      select:{id:true,status:true,isDeleted:true,resultsPublishedAt:true},
    });
    if (!stage || stage.isDeleted || stage.resultsPublishedAt
      || !['PUBLISHED','COMPLETED'].includes(stage.status)) {
      throw new Error('Центральный этап уже опубликован или неактивен');
    }
    // Result journals include DELETE and multiple edits of the same signed
    // result. Only the LAST operation per UUID defines the final state. Never
    // demand that an intentionally deleted result still exist in PostgreSQL.
    const receipts=await prisma.$queryRawUnsafe<Array<{id:string;operation:string|null}>>(
      'SELECT DISTINCT ON ("entityId") "entityId" AS id,metadata->>\'operation\' AS operation FROM "AuditLog" WHERE action IN ($1,$2) AND entity=$3 AND metadata->>\'stageId\'=$4 AND "entityId" IS NOT NULL ORDER BY "entityId",(metadata->>\'sequence\')::bigint DESC NULLS LAST',
      'VENUE_RESULT_IMPORTED','VENUE_FULL_EVENT_IMPORTED','Result',stageId);
    const ids:string[]=[];
    for (const receipt of receipts) {
      const id=receipt.id;
      if (!UUID.test(id))throw new Error('Неверная запись журнала переноса');
      const result=await prisma.result.findUnique({
        where:{id},
        select:{registration:{select:{stageId:true}}},
      });
      if (receipt.operation==='DELETE') {
        if(result)throw new Error('Удалённый на площадке результат снова появился в центре');
        continue;
      }
      if (!result || result.registration.stageId!==stageId) {
        throw new Error('Не найдена перенесённая запись результатов');
      }
      ids.push(id);
    }
    if (!receipts.length) return {stageId,recalculated:false,resultCount:0};
    const ranking=new ResultsRankingService(prisma as unknown as PrismaService);
    const records=new RecordsService(prisma as unknown as PrismaService);
    await ranking.recalculateByStage(stageId);
    for (const id of ids) {
      await records.createFromResultIfEligible(id);
    }
    await prisma.auditLog.create({
      data:{
        action:'VENUE_RETURN_DERIVED_REBUILT',
        entity:'Stage',entityId:stageId,
        metadata:{stageId,resultsChecked:ids.length,deletedResults:receipts.length-ids.length,officiallyPublished:false},
      },
    });
    return {stageId,recalculated:true,resultCount:ids.length};
  } finally {
    await prisma.$disconnect();
  }
}
// Jest ESM loads this module as a service dependency without CommonJS globals.
// Keep CLI-only execution isolated: production CJS still runs directly.
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main===module) {
  finalizeVenueStage(process.argv[2]??'',process.env.DATABASE_URL??'')
    .then(result=>console.log(JSON.stringify(result)))
    .catch(()=>{
      console.error('VENUE FINALIZATION BLOCKED: keep all local and central receipts');
      process.exitCode=1;
    });
}
