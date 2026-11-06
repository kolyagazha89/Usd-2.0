import { Module } from '@nestjs/common';

import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { DataQualityService } from '../data-quality/data-quality.service';
import { SeasonReportsService } from './season-reports.service';

@Module({
  controllers: [StatisticsController],
  providers: [StatisticsService, DataQualityService, SeasonReportsService],
  exports: [StatisticsService],
})
export class StatisticsModule {}
