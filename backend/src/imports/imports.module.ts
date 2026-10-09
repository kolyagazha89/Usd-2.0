import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { RecordsModule } from '../records/records.module';
import { ResultsModule } from '../results/results.module';

@Module({
  imports: [RecordsModule, ResultsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}