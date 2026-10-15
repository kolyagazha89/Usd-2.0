import { Module } from '@nestjs/common';
import { NormalizationDryRunController } from './normalization-dry-run.controller';
import { NormalizationDryRunService } from './normalization-dry-run.service';

@Module({
  controllers: [NormalizationDryRunController],
  providers: [NormalizationDryRunService],
})
export class NormalizationDryRunModule {}
