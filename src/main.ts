import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express from 'express';

import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import {
  DEFAULT_REQUEST_BODY_LIMIT,
  DEFAULT_TRUST_PROXY_HOPS,
} from './common/security/security.constants';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error('JWT_SECRET должен быть задан и содержать минимум 32 байта');
  }

  if (isProduction && process.env.AUTH_COOKIE_SECURE !== 'true') {
    throw new Error('AUTH_COOKIE_SECURE=true обязателен в production');
  }

  const corsOrigins = (
    process.env.CORS_ORIGINS ??
    (isProduction ? '' : 'http://localhost:3000,http://localhost:5173')
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (isProduction && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS должен быть задан в production');
  }

  const trustProxyHops = Number(
    process.env.TRUST_PROXY_HOPS ?? DEFAULT_TRUST_PROXY_HOPS,
  );

  if (
    !Number.isInteger(trustProxyHops) ||
    trustProxyHops < 0 ||
    trustProxyHops > 10
  ) {
    throw new Error('TRUST_PROXY_HOPS должен быть целым числом от 0 до 10');
  }

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.disable('x-powered-by');
  expressApp.set('trust proxy', trustProxyHops);

  expressApp.use(
    express.json({
      limit:
        process.env.REQUEST_BODY_LIMIT ??
        DEFAULT_REQUEST_BODY_LIMIT,
      strict: true,
    }),
  );

  expressApp.use(
    express.urlencoded({
      extended: false,
      limit: '100kb',
    }),
  );

  app.use(cookieParser());

  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );

    if (isProduction) {
      response.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }

    if (request.path.startsWith('/auth/')) {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Pragma', 'no-cache');
    }

    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalGuards(
    app.get(JwtAuthGuard),
    app.get(RolesGuard),
  );

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: [
      'GET',
      'HEAD',
      'OPTIONS',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
    ],
    maxAge: 86400,
  });

  const trustedOrigins = (
    process.env.CSRF_TRUSTED_ORIGINS ?? ''
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (trustedOrigins.length > 0) {
    const csrfApp = app as typeof app & {
      enableCsrfProtection?: (options: {
        trustedOrigins: string[];
      }) => void;
    };

    if (
      typeof csrfApp.enableCsrfProtection ===
      'function'
    ) {
      csrfApp.enableCsrfProtection({
        trustedOrigins,
      });
    }
  } else if (isProduction) {
    throw new Error(
      'CSRF_TRUSTED_ORIGINS должен быть задан в production',
    );
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
