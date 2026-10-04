import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { SecurityMiddleware } from './security.middleware';

@Module({
  providers: [SecurityMiddleware],
})
export class SecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*');
  }
}
