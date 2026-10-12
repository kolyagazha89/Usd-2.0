import {Module} from '@nestjs/common';
import {SiteSettingsController} from './site-settings.controller';
import {SiteSettingsService} from './site-settings.service';
import { MediaModule } from '../media/media.module';

@Module({imports:[MediaModule],controllers:[SiteSettingsController],providers:[SiteSettingsService],exports:[SiteSettingsService]})
export class SiteSettingsModule{}
