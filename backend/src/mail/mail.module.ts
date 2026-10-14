import { Module } from '@nestjs/common';

import { MailService } from './mail.service';
import { GoogleModule } from '../google/google.module';

@Module({
  imports: [GoogleModule],
  providers: [
    MailService,
  ],
  exports: [
    MailService,
  ],
})
export class MailModule {}