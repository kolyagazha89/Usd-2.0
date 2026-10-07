import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const stages = await prisma.stage.findMany({
      where: { isDeleted: false },
      select: { id: true, stageNumber: true, name: true, status: true },
      orderBy: { stageNumber: 'asc' },
    });
    const results = await prisma.result.findMany({
      where: { isHistorical: true },
      select: {
        id: true, value: true, place: true, verificationStatus: true,
        registration: {
          select: {
            participantNumber: true, stageId: true,
            participant: { select: { lastName: true, firstName: true } },
            car: { select: { brand: true, model: true } },
          },
        },
        registrationClass: { select: { class: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const summary = {
      stageCount: stages.length,
      historicalResultCount: results.length,
      pending: results.filter(r => r.verificationStatus === 'PENDING').length,
      verified: results.filter(r => r.verificationStatus === 'VERIFIED').length,
      carsWithImportPrefix: results.filter(r => String(r.registration.car?.brand ?? '').toLowerCase() === 'импорт').length,
      carsMissing: results.filter(r => !r.registration.car).length,
      carsExplicitlyMissing: results.filter(r => String(r.registration.car?.model ?? '').toLowerCase() === 'автомобиль не указан').length,
      zeroValues: results.filter(r => Number(r.value) === 0).length,
      stages,
    };
    console.log('HISTORICAL_AUDIT_START');
    console.log(JSON.stringify(summary, null, 2));
    console.log('HISTORICAL_AUDIT_END');
  } finally {
    await app.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
