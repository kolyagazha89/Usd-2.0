import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { HistoricalResultsService } from './historical-results.service';
import { CreateHistoricalResultDto, UpdateHistoricalResultDto } from './dto/historical-result.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('historical-results')
export class HistoricalResultsController {
  constructor(private readonly service: HistoricalResultsService) {}

  @Public()
  @Get('public')
  findPublic() {
    return this.service.findPublic();
  }

  @Public()
  @Get('public/stage/:stageId')
  findPublicByStage(@Param('stageId') stageId: string) {
    return this.service.findPublic(stageId);
  }

  @Public()
  @Get('public/:id')
  findPublicOne(@Param('id') id: string) {
    return this.service.findPublicOne(id);
  }

  @Roles('ADMIN')
  @Get('pending')
  findPending() {
    return this.service.findPending();
  }

  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.service.findAllAdmin();
  }

  @Roles('ADMIN')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOneAdmin(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() body: CreateHistoricalResultDto, @Req() req: AuthenticatedRequest) {
    return this.service.create(body, req);
  }

  @Roles('ADMIN')
  @Post(':id/verify')
  verify(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.verify(id, req);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateHistoricalResultDto, @Req() req: AuthenticatedRequest) {
    return this.service.update(id, body, req);
  }
}
