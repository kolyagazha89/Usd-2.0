import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

const directions = [
  {
    name: 'SPL',
    sortOrder: 1,
    classes: [
      {
        code: 'LIMITED_2_0',
        name: 'Limited 2.0',
        sortOrder: 1,
      },
      {
        code: '1X2',
        name: '1x2',
        sortOrder: 2,
      },
      {
        code: '2X2',
        name: '2x2',
        sortOrder: 3,
      },
      {
        code: 'NOLIM',
        name: 'NoLim',
        sortOrder: 4,
      },
      {
        code: 'SEDAN',
        name: 'Sedan',
        sortOrder: 5,
      },
      {
        code: 'COFFIN',
        name: 'Coffin',
        sortOrder: 6,
      },
      {
        code: 'WALL',
        name: 'Wall',
        sortOrder: 7,
      },
      {
        code: 'WALL_PLUS',
        name: 'Wall+',
        sortOrder: 8,
      },
      {
        code: 'MAD_X',
        name: 'Mad-X',
        sortOrder: 9,
      },
    ],
  },

  {
    name: 'BFSPL',
    sortOrder: 2,
    classes: [
      {
        code: 'GATE_1_6',
        name: 'Gate 1-6',
        sortOrder: 1,
      },
      {
        code: 'WICKET_6_10',
        name: 'Wicket 6-10',
        sortOrder: 2,
      },
      {
        code: 'WICKET_10_PLUS',
        name: 'Wicket 10+',
        sortOrder: 3,
      },
    ],
  },

  {
    name: 'BDW',
    sortOrder: 3,
    classes: [
      {
        code: 'BDW',
        name: 'BDW',
        sortOrder: 1,
      },
      {
        code: 'BDW_EX',
        name: 'BDW Ex',
        sortOrder: 2,
      },
    ],
  },

  {
    name: 'BassRace',
    sortOrder: 4,
    classes: [
      {
        code: 'BASSRACE_129_9',
        name: 'BassRace 129.9',
        sortOrder: 1,
      },
      {
        code: 'BASSRACE_139_9',
        name: 'BassRace 139.9',
        sortOrder: 2,
      },
      {
        code: 'BASSRACE_149_9',
        name: 'BassRace 149.9',
        sortOrder: 3,
      },
      {
        code: 'BASSRACE_159_9',
        name: 'BassRace 159.9',
        sortOrder: 4,
      },
    ],
  },

  {
    name: 'Hurrican',
    sortOrder: 5,
    classes: [
      {
        code: 'STORM_WALL',
        name: 'Storm Wall',
        sortOrder: 1,
      },
    ],
  },
];

async function main() {
  console.log('Начинаем заполнение направлений и классов...');

  for (const directionData of directions) {
    const existingDirection = await prisma.direction.findFirst({
  where: {
    name: directionData.name,
  },
});

const direction = existingDirection
  ? await prisma.direction.update({
      where: {
        id: existingDirection.id,
      },
      data: {
        sortOrder: directionData.sortOrder,
        isActive: true,
      },
    })
  : await prisma.direction.create({
      data: {
        name: directionData.name,
        sortOrder: directionData.sortOrder,
        isActive: true,
      },
    });

    console.log(`Направление: ${direction.name}`);

    for (const classData of directionData.classes) {
      const existingClass = await prisma.class.findUnique({
        where: {
          code: classData.code,
        },
      });

      if (existingClass) {
        await prisma.class.update({
          where: {
            id: existingClass.id,
          },
          data: {
            directionId: direction.id,
            name: classData.name,
            sortOrder: classData.sortOrder,
            isActive: true,
          },
        });

        console.log(`  обновлён: ${classData.name}`);
      } else {
        await prisma.class.create({
          data: {
            directionId: direction.id,
            code: classData.code,
            name: classData.name,
            sortOrder: classData.sortOrder,
            isActive: true,
          },
        });

        console.log(`  создан: ${classData.name}`);
      }
    }
  }

  console.log('Готово.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });