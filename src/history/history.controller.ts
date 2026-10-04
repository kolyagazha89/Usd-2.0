import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import { HistoryService } from './history.service';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('participant/:participantId')
  getParticipantHistory(
    @Param('participantId') participantId: string,
  ) {
    return this.historyService.getParticipantHistory(participantId);
  }
}