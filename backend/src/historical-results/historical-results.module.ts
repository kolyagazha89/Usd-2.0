import { Module } from '@nestjs/common';
import { HistoricalResultsController } from './historical-results.controller';
import { HistoricalResultsService } from './historical-results.service';
import { RecordsModule } from '../records/records.module';
import { ResultsModule } from '../results/results.module';

@Module({
  imports: [RecordsModule, ResultsModule],
  controllers: [HistoricalResultsController],
  providers: [HistoricalResultsService],
})
export class HistoricalResultsModule {}
