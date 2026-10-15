import { Module } from '@nestjs/common';

import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { EmailNotificationsService } from './email-notifications.service';

@Module({
  controllers: [MailController],
  providers: [
    MailService,
    EmailNotificationsService,
  ],
  exports: [
    MailService,
    EmailNotificationsService,
  ],
})
export class MailModule {}