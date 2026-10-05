import { Module } from '@nestjs/common';
import { DataQualityModule } from '../data-quality/data-quality.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [DataQualityModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
