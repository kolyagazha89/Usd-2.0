import { Module } from '@nestjs/common';

import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { DataQualityService } from '../data-quality/data-quality.service';

@Module({
  controllers: [StatisticsController],
  providers: [StatisticsService, DataQualityService],
  exports: [StatisticsService],
})
export class StatisticsModule {}
