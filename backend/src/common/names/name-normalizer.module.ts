import { Global, Module } from '@nestjs/common';
import { NameNormalizerService } from './name-normalizer.service';

@Global()
@Module({
  providers: [NameNormalizerService],
  exports: [NameNormalizerService],
})
export class NameNormalizerModule {}