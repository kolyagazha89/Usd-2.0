import 'dotenv/config';

import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} должен быть задан в окружении`);
  return value;
}

async function main() {
  const email = requiredEnv('ADMIN_EMAIL').toLowerCase();
  const password = requiredEnv('ADMIN_PASSWORD');
  const name = process.env.ADMIN_NAME?.trim() || 'USD Administrator';

  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD должен содержать минимум 12 символов');
  }

  const adapter = new PrismaPg({
    connectionString: requiredEnv('DATABASE_URL'),
  });

  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      const user = await prisma.user.update({
        where: { email },
        data: {
          passwordHash,
          name,
          role: 'ADMIN',
          isActive: true,
          emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
        },
      });

      console.log('ADMIN уже существовал — данные обновлены.');
      console.log(`ID: ${user.id}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role}`);
      console.log(`Email verified: ${user.emailVerifiedAt !== null}`);
      return;
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: 'ADMIN',
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });

    console.log('ADMIN успешно создан.');
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
    console.log(`Email verified: ${user.emailVerifiedAt !== null}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
