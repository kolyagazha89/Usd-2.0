import { Module } from '@nestjs/common';

import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';
import { ResultsRankingService } from './results-ranking.service';

import { RecordsModule } from '../records/records.module';

@Module({
  imports: [
    RecordsModule,
  ],
  controllers: [
    ResultsController,
  ],
  providers: [
    ResultsService,
    ResultsRankingService,
  ],
  exports: [
    ResultsRankingService,
    ResultsService,
  ],
})
export class ResultsModule {}