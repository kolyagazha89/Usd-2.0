import { Module } from '@nestjs/common';
import { HistoricalResultsController } from './historical-results.controller';
import { HistoricalResultsService } from './historical-results.service';
import { RecordsModule } from '../records/records.module';

@Module({
  imports: [RecordsModule],
  controllers: [HistoricalResultsController],
  providers: [HistoricalResultsService],
})
export class HistoricalResultsModule {}
