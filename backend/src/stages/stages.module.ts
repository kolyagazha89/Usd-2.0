import { Module } from '@nestjs/common';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';
import { SiteSettingsModule } from '../site-settings/site-settings.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [SiteSettingsModule, MailModule],
  controllers: [StagesController],
  providers: [StagesService],
})
export class StagesModule {}