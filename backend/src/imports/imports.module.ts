import { GlobalHistoricalImportController } from './global-historical-import.controller';
import { GlobalHistoricalImportService } from './global-historical-import.service';
import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { HistoricalImportResetController } from './historical-import-reset.controller';
import { HistoricalImportResetService } from './historical-import-reset.service';
import { HistoricalOrphanCleanupController } from './historical-orphan-cleanup.controller';
import { HistoricalOrphanCleanupService } from './historical-orphan-cleanup.service';
import { UnclaimedTestPurgeController } from './unclaimed-test-purge.controller';
import { UnclaimedTestPurgeService } from './unclaimed-test-purge.service';
import { HistoricalNameRepairController } from './historical-name-repair.controller';
import { HistoricalNameRepairService } from './historical-name-repair.service';
import { RecordsModule } from '../records/records.module';

@Module({
  imports: [RecordsModule],
  controllers: [GlobalHistoricalImportController, ImportsController, HistoricalImportResetController, HistoricalOrphanCleanupController, UnclaimedTestPurgeController, HistoricalNameRepairController],
  providers: [GlobalHistoricalImportService, ImportsService, HistoricalImportResetService, HistoricalOrphanCleanupService, UnclaimedTestPurgeService, HistoricalNameRepairService],
})
export class ImportsModule {}