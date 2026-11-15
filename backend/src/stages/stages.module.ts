import { PushModule } from '../push/push.module';
import { Module } from '@nestjs/common';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';
import {VenueAutoSyncService} from './venue-auto-sync.service';
import { VenueStageService } from './venue-stage.service';
import { VenueCertificateService } from './venue-certificate.service';
import { SiteSettingsModule } from '../site-settings/site-settings.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [SiteSettingsModule, MailModule, PushModule],
  controllers: [StagesController],
  providers: [StagesService, VenueStageService, VenueAutoSyncService, VenueCertificateService],
})
export class StagesModule {}