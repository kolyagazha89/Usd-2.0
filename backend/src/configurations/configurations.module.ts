import { Module } from '@nestjs/common';

import { ConfigurationsController } from './configurations.controller';
import { ConfigurationsService } from './configurations.service';

@Module({
  controllers: [
    ConfigurationsController,
  ],
  providers: [
    ConfigurationsService,
  ],
  exports: [
    ConfigurationsService,
  ],
})
export class ConfigurationsModule {}