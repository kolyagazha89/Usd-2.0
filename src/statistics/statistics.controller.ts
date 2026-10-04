import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';

import { Roles } from '../auth/roles.decorator';
import { StatisticsService } from './statistics.service';
import { DataQualityService } from '../data-quality/data-quality.service';
import { AuditService } from '../common/audit/audit.service';

@Controller('statistics')
@Roles('ADMIN', 'JUDGE')
export class StatisticsController {
  constructor(
    private readonly statisticsService: StatisticsService,
    private readonly dataQualityService: DataQualityService,
    private readonly auditService: AuditService,
  ) {}

  @Get('audit')
  @Roles('ADMIN')
  getAudit(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
  ) {
    return this.auditService.list({ page, limit, entity, action });
  }

  @Get('data-quality/report')
  @Roles('ADMIN')
  getDataQualityReport() {
    return this.dataQualityService.getReport();
  }

  @Get('overview')
  getOverview() {
    return this.statisticsService.getOverview();
  }

  @Get('participants')
  getParticipants(
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit = 25,
  ) {
    return this.statisticsService.getParticipants({
      search,
      page,
      limit,
    });
  }

  @Get('participants/:participantId')
  getParticipant(
    @Param('participantId') participantId: string,
  ) {
    return this.statisticsService.getParticipant(participantId);
  }

  @Get('stages/:stageId')
  getStage(
    @Param('stageId') stageId: string,
  ) {
    return this.statisticsService.getStage(stageId);
  }

  @Get('classes/:classId')
  getClass(
    @Param('classId') classId: string,
  ) {
    return this.statisticsService.getClass(classId);
  }

  @Get('cars/:carId')
  getCar(
    @Param('carId') carId: string,
  ) {
    return this.statisticsService.getCar(carId);
  }

  @Get('seasons/:seasonId')
  getSeason(
    @Param('seasonId') seasonId: string,
  ) {
    return this.statisticsService.getSeason(seasonId);
  }
}
