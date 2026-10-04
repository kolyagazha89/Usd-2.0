import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(
    AppModule,
    {
      logger: false,
    },
  );

  try {
    const prisma = app.get(PrismaService);

    const registrationIds = [
      '619c1bad-b88d-4c87-9ccb-a455fb4a2092',
      'b1d82da9-f0ed-4af3-b802-3554277f90c3',
      'c6e6fddd-f445-41d4-b311-7b29fe9f77eb',
    ];

    const registrations =
      await prisma.registration.findMany({
        where: {
          id: {
            in: registrationIds,
          },
        },
        select: {
          id: true,
          stageId: true,
          participantId: true,
          carId: true,
          participantNumber: true,
          registeredAt: true,
          source: true,
          status: true,
          participant: {
            select: {
              id: true,
              lastName: true,
              firstName: true,
              middleName: true,
              cars: {
                select: {
                  id: true,
                  brand: true,
                  model: true,
                  registrationNumber: true,
                  registrationCountry: true,
                  color: true,
                  isActive: true,
                  isPublic: true,
                },
                orderBy: {
                  createdAt: 'asc',
                },
              },
            },
          },
        },
        orderBy: {
          participantNumber: 'asc',
        },
      });

    console.log(
      JSON.stringify(registrations, null, 2),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
