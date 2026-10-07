import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ImportsService } from '../imports/imports.service';
import { PrismaService } from '../prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const alreadyImported = await prisma.importJob.count({
      where: {
        status: 'COMMITTED',
        metadata: {
          path: ['source'],
          equals: 'HISTORICAL_XLSX',
        },
      },
    });

    if (alreadyImported >= 11) {
      console.log('Historical migration already completed; nothing to do.');
      return;
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
