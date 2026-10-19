import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { ResultsModule } from '../results/results.module';
import { MediaModule } from '../media/media.module';
import { AdminDeletionController } from './admin-deletion.controller';
import { AdminDeletionService } from './admin-deletion.service';
@Module({
  imports: [RecordsModule, ResultsModule, MediaModule],
  controllers: [AdminDeletionController],
  providers: [AdminDeletionService],
})
export class AdminDeletionModule {}
