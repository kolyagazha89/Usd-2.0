import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { RecordsService } from './records.service';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Public()
  @Get()
  findAll() {
    return this.recordsService.findAll();
  }

  @Public()
  @Get('current')
  findCurrent() {
    return this.recordsService.findCurrent();
  }

  @Public()
  @Get('class/:classId')
  findByClass(@Param('classId') classId: string) {
    return this.recordsService.findByClass(classId);
  }

  @Public()
  @Get('season/:seasonId')
  findBySeason(@Param('seasonId') seasonId: string) {
    return this.recordsService.findBySeason(seasonId);
  }

  @Roles('ADMIN')
  @Get('admin/current')
  findCurrentAdmin() {
    return this.recordsService.findCurrentAdmin();
  }

  @Roles('ADMIN')
  @Get('admin/history')
  findAllAdmin() {
    return this.recordsService.findAllAdmin();
  }

  @Roles('ADMIN')
  @Get('admin/candidates')
  findManualCandidates(@Query('classId') classId: string) {
    return this.recordsService.findManualCandidates(classId);
  }

  @Roles('ADMIN')
  @Patch('admin/:id/assign')
  updateManualRecord(
    @Param('id') id: string,
    @Body() body: { resultId: string; notes?: string | null },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.recordsService.updateManualRecord(id, body.resultId, body.notes, req);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.recordsService.findOne(id);
  }
}
