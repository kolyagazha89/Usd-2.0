import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ImportsService } from '../imports/imports.service';
import { PrismaService } from '../prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const prisma = app.get(PrismaService);

    const expectedHistoricalStages = 10;
    const historicalJobs = await prisma.importJob.findMany({
      where: {
        metadata: { path: ['source'], equals: 'HISTORICAL_XLSX' },
      },
      select: { stageId: true, status: true },
    });

    const stageIds = [...new Set(historicalJobs.map(job => job.stageId))];
    const committedStageIds = [...new Set(
      historicalJobs.filter(job => job.status === 'COMMITTED').map(job => job.stageId),
    )];

    if (stageIds.length > 0) {
      const historicalResultCount = await prisma.result.count({
        where: { registration: { stageId: { in: stageIds } } },
      });

      if (committedStageIds.length >= expectedHistoricalStages && historicalResultCount > 0) {
        console.log(
          `Historical migration already completed: ${committedStageIds.length}/${expectedHistoricalStages} committed stages, ${historicalResultCount} results. Skipping.`,
        );
      } else {
        console.warn(
          `Historical import data already exists (${stageIds.length} stages, ${committedStageIds.length} committed, ${historicalResultCount} results). Automatic startup migration skipped to protect existing data. Reconcile historical imports explicitly from the admin workflow.`,
        );
      }

      // Never delete existing stages/results during application startup.
      // A partial or inconsistent import must be reconciled explicitly, not destructively reset.
      return;
    }

    console.log('No previous historical import stages found; initial migration can start.');

    const imports = app.get(ImportsService);
    const result = await imports.autoCommitHistoricalImport(undefined as any);
    console.log(JSON.stringify(result, null, 2));

    if (!result.success || result.committed < result.prepared) {
      throw new Error(
        `Historical migration incomplete: ${result.committed}/${result.prepared} stages committed`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
