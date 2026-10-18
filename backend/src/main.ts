import { createApplication } from './application';

async function bootstrap() {
  const app = await createApplication();
  const server = await app.listen(process.env.PORT ?? 3000);
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
}

void bootstrap();
