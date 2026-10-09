import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';

import { ResultsService } from './results.service';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CreateResultDto, DeleteResultDto, UpdateResultDto } from './dto/result.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Controller('results')
export class ResultsController {
  constructor(
    private readonly resultsService: ResultsService,
  ) {}

  @Public()
  @Get('stage/:stageId')
  findByStage(@Param('stageId') stageId: string) {
    return this.resultsService.findByStage(stageId);
  }

  @Roles('ADMIN', 'JUDGE')
  @Get('admin/stage/:stageId')
  findByStageAdmin(@Param('stageId') stageId: string) {
    return this.resultsService.findByStageAdmin(stageId);
  }

  @Public()
  @Get('registration/:registrationId')
  findByRegistration(
    @Param('registrationId') registrationId: string,
  ) {
    return this.resultsService.findByRegistration(registrationId);
  }

  @Public()
  @Get('registration-class/:registrationClassId')
  findByRegistrationClass(
    @Param('registrationClassId') registrationClassId: string,
  ) {
    return this.resultsService.findByRegistrationClass(
      registrationClassId,
    );
  }

  @Roles('ADMIN', 'JUDGE')
  @Get('admin/:id')
  findOneAdmin(@Param('id') id: string) {
    return this.resultsService.findOneAdmin(id);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.resultsService.findOne(id);
  }

  @Roles('ADMIN', 'JUDGE')
  @Post()
  create(
    @Body() body: CreateResultDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.resultsService.create(body, request);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateResultDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.resultsService.update(id, body, request);
  }
  @Roles('ADMIN')
  @Post(':id/delete')
  remove(
    @Param('id') id: string,
    @Body() body: DeleteResultDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.resultsService.remove(id, body, request);
  }

}
