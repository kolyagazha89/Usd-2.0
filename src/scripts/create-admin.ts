import 'dotenv/config';

import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

async function main() {
  const email = 'admin@usd-russia.com';
  const password = 'USDadmin2026!';
  const name = 'USD Administrator';

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });

  const prisma = new PrismaClient({
    adapter,
  });

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

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
      console.log(`Password: ${password}`);

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
    console.log(`Password: ${password}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});