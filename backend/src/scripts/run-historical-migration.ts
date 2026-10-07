import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ImportsService } from '../imports/imports.service';
import { PrismaService } from '../prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const prisma = app.get(PrismaService);

    const alreadyImported = await prisma.importJob.count({
      where: {
        status: 'COMMITTED',
        metadata: { path: ['source'], equals: 'HISTORICAL_XLSX' },
      },
    });

    if (alreadyImported >= 11) {
      console.log('Historical migration already completed; nothing to do.');
      return;
    }

    const historicalJobs = await prisma.importJob.findMany({
      where: {
        metadata: { path: ['source'], equals: 'HISTORICAL_XLSX' },
      },
      select: { stageId: true },
    });

    const stageIds = [...new Set(historicalJobs.map(job => job.stageId))];

    if (stageIds.length > 0) {
      console.log(`Dropping ${stageIds.length} previously imported historical stages before clean migration.`);

      await prisma.$transaction(async tx => {
        await tx.record.deleteMany({ where: { stageId: { in: stageIds } } });
        await tx.disqualification.deleteMany({ where: { stageId: { in: stageIds } } });
        await tx.result.deleteMany({
          where: { registration: { stageId: { in: stageIds } } },
        });
        await tx.registrationClass.deleteMany({
          where: { registration: { stageId: { in: stageIds } } },
        });
        await tx.inspection.deleteMany({
          where: { registration: { stageId: { in: stageIds } } },
        });
        await tx.registration.deleteMany({ where: { stageId: { in: stageIds } } });
        await tx.registrationNumber.deleteMany({ where: { stageId: { in: stageIds } } });
        await tx.importJob.deleteMany({ where: { stageId: { in: stageIds } } });
        await tx.stageClass.deleteMany({ where: { stageId: { in: stageIds } } });
        await tx.stage.deleteMany({ where: { id: { in: stageIds } } });
      });

      console.log('Historical stages/results cleanup completed.');
    } else {
      console.log('No previous historical import stages found; clean migration can start.');
    }

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
