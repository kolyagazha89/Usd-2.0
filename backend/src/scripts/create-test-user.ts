import 'dotenv/config';

import {
  INestApplicationContext,
  Logger,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import * as bcrypt from 'bcrypt';

import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const logger = new Logger('CreateTestUser');

async function bootstrap() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'Тестовые пользователи могут создаваться только при NODE_ENV=development',
    );
  }

  const app: INestApplicationContext =
    await NestFactory.createApplicationContext(
      AppModule,
      {
        logger: false,
      },
    );

  try {
    const prisma =
      app.get(PrismaService);

    const email =
      'judge@test.usd-russia.ru';

    const password =
      'JudgeTest123!';

    const name =
      'Test Judge';

    const passwordHash =
      await bcrypt.hash(password, 12);

    const judgeRole = await prisma.role.findUnique({ where: { key: 'judge' }, select: { id: true } });
    if (!judgeRole) throw new Error('Custom role «Судья» is missing. Run Prisma migrations first.');

    const user =
      await prisma.user.upsert({
        where: {
          email,
        },
        update: {
          passwordHash,
          name,
          role: 'PARTICIPANT',
          customRoleId: judgeRole.id,
          isActive: true,
          emailVerifiedAt:
            new Date(),
        },
        create: {
          email,
          passwordHash,
          name,
          role: 'PARTICIPANT',
          customRoleId: judgeRole.id,
          isActive: true,
          emailVerifiedAt:
            new Date(),
        },
      });

    await prisma.emailVerificationToken.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await prisma.refreshSession.deleteMany({
      where: {
        userId: user.id,
      },
    });

    logger.log(
      'Тестовый пользователь создан/обновлён',
    );

    console.log('');
    console.log(
      '========================================',
    );
    console.log(
      '       USD TEST USER',
    );
    console.log(
      '========================================',
    );
    console.log(
      `Email:     ${email}`,
    );
    console.log(
      `Password:  ${password}`,
    );
    console.log(
      `Role:      ${user.role}`,
    );
    console.log(
      `Verified:  ${Boolean(user.emailVerifiedAt)}`,
    );
    console.log(
      `User ID:   ${user.id}`,
    );
    console.log(
      '========================================',
    );
    console.log('');
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('');
  console.error(
    'Ошибка создания тестового пользователя:',
  );
  console.error(error);
  process.exit(1);
});