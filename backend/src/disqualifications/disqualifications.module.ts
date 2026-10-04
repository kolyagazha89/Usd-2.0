import { Module } from '@nestjs/common';

import { DisqualificationsController } from './disqualifications.controller';
import { DisqualificationsService } from './disqualifications.service';
import { CompetitionRecalculationService } from './competition-recalculation.service';

import { ResultsModule } from '../results/results.module';
import { RecordsModule } from '../records/records.module';

@Module({
  imports: [
    ResultsModule,
    RecordsModule,
  ],
  controllers: [
    DisqualificationsController,
  ],
  providers: [
    DisqualificationsService,
    CompetitionRecalculationService,
  ],
  exports: [
    DisqualificationsService,
  ],
})
export class DisqualificationsModule {}