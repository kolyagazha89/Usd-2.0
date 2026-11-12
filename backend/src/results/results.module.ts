import { Module } from '@nestjs/common';

import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';
import { ResultsRankingService } from './results-ranking.service';
import { ResultDeletionService } from './result-deletion.service';
import { BassRaceTextImportService } from './bassrace-text-import.service';

import { RecordsModule } from '../records/records.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    RecordsModule,
    MailModule,
  ],
  controllers: [
    ResultsController,
  ],
  providers: [
    ResultsService,
    ResultsRankingService,
    ResultDeletionService,
    BassRaceTextImportService,
  ],
  exports: [
    ResultsRankingService,
  ],
})
export class ResultsModule {}