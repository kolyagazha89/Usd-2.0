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

    const participantIds = [
      '6495d230-2647-4b71-a1eb-dc833d7ffd3a',
      '6e6dcf86-baec-4931-ab32-cd6f4c874b4d',
      '663e7f51-1e23-4ff1-80cd-9169b410a8eb',
    ];

    const participants =
      await prisma.participant.findMany({
        where: {
          id: {
            in: participantIds,
          },
        },
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
      });

    console.log(
      JSON.stringify(participants, null, 2),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
