import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import { HistoryService } from './history.service';
import { Roles } from '../auth/roles.decorator';

@Controller('history')
@Roles('ADMIN', 'JUDGE')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('participant/:participantId')
  getParticipantHistory(
    @Param('participantId') participantId: string,
  ) {
    return this.historyService.getParticipantHistory(participantId);
  }
}