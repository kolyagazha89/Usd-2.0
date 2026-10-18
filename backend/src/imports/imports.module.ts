import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { HistoricalImportResetController } from './historical-import-reset.controller';
import { HistoricalImportResetService } from './historical-import-reset.service';

@Module({
  controllers: [ImportsController, HistoricalImportResetController],
  providers: [ImportsService, HistoricalImportResetService],
})
export class ImportsModule {}