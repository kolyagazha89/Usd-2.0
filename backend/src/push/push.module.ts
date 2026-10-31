import { Module } from '@nestjs/common';
import { PushAdminController, PushController } from './push.controller';
import { PushService } from './push.service';
import { PushTransport } from './push.transport';
@Module({
  controllers: [PushController, PushAdminController],
  providers: [PushService, PushTransport],
  exports: [PushService],
})
export class PushModule {}
