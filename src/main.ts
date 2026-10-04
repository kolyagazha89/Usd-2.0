import { NestFactory } from '@nestjs/core';

import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

async function bootstrap() {
  const app =
    await NestFactory.create(
      AppModule,
    );

  app.use(cookieParser());

  const jwtAuthGuard =
    app.get(JwtAuthGuard);

  app.useGlobalGuards(
    jwtAuthGuard,
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  await app.listen(
    process.env.PORT ?? 3000,
  );
}

void bootstrap();