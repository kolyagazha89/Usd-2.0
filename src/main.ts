import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

async function bootstrap() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error('JWT_SECRET должен быть задан и содержать минимум 32 байта');
  }

  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.useGlobalGuards(app.get(JwtAuthGuard), app.get(RolesGuard));

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  const trustedOrigins = (process.env.CSRF_TRUSTED_ORIGINS ?? '')
    .split(',').map((origin) => origin.trim()).filter(Boolean);

  if (trustedOrigins.length > 0) {
    app.enableCsrfProtection({ trustedOrigins });
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('CSRF_TRUSTED_ORIGINS должен быть задан в production');
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
