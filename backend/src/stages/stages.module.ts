import { Module } from '@nestjs/common';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';
import { SiteSettingsModule } from '../site-settings/site-settings.module';
import { SiteSettingsService } from '../site-settings/site-settings.service';

@Module({
  imports: [SiteSettingsModule],
  controllers: [StagesController],
  providers: [StagesService, { provide: 'SiteSettingsService', useExisting: SiteSettingsService }],
})
export class StagesModule {}