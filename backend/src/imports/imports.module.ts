import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { HistoricalImportResetController } from './historical-import-reset.controller';
import { HistoricalImportResetService } from './historical-import-reset.service';
import { HistoricalOrphanCleanupController } from './historical-orphan-cleanup.controller';
import { HistoricalOrphanCleanupService } from './historical-orphan-cleanup.service';
import { RecordsModule } from '../records/records.module';

@Module({
  imports: [RecordsModule],
  controllers: [ImportsController, HistoricalImportResetController, HistoricalOrphanCleanupController],
  providers: [ImportsService, HistoricalImportResetService, HistoricalOrphanCleanupService],
})
export class ImportsModule {}