import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { HistoryService } from './history.service';
import { Roles } from '../auth/roles.decorator';

@Controller('history')
@Roles('ADMIN', 'JUDGE')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Roles('ADMIN')
  @Get('audit')
  getAudit(
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
  ) {
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    return this.historyService.getAuditLogs({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      action,
      entity,
      entityId,
    });
  }

  @Get('participant/:participantId')
  getParticipantHistory(
    @Param('participantId') participantId: string,
  ) {
    return this.historyService.getParticipantHistory(participantId);
  }
}