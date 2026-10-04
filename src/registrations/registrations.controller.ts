import {
  Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { Roles } from '../auth/roles.decorator';
import { RegistrationsService } from './registrations.service';

@Controller('registrations')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Roles('ADMIN', 'JUDGE')
  @Get()
  findAll(@Query('stageId') stageId?: string, @Query('status') status?: 'ACTIVE' | 'CANCELLED') {
    return this.registrationsService.findAll(stageId, status);
  }

  @Get(':id')
  async findOne(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const registration = await this.registrationsService.findOne(id);
    if (request.user.role === 'PARTICIPANT' && registration.participantId !== request.user.participantId) {
      throw new ForbiddenException('Нет доступа к этой регистрации');
    }
    return registration;
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: {
    stageId: string; participantId: string; carId: string; classIds: string[];
    configurationId?: string; source?: 'PRE_REGISTRATION' | 'ON_SITE' | 'IMPORT';
  }) {
    if (request.user.role === 'PARTICIPANT' && body.participantId !== request.user.participantId) {
      throw new ForbiddenException('Нельзя создавать регистрацию за другого участника');
    }
    return this.registrationsService.create(body);
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Patch(':id/classes')
  async updateClasses(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: { classIds: string[] }) {
    const registration = await this.registrationsService.findOne(id);
    if (request.user.role === 'PARTICIPANT' && registration.participantId !== request.user.participantId) {
      throw new ForbiddenException('Нет доступа к этой регистрации');
    }
    return this.registrationsService.updateClasses(id, body.classIds);
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Delete(':id')
  async cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const registration = await this.registrationsService.findOne(id);
    if (request.user.role === 'PARTICIPANT' && registration.participantId !== request.user.participantId) {
      throw new ForbiddenException('Нет доступа к этой регистрации');
    }
    return this.registrationsService.cancel(id);
  }

  @Roles('ADMIN')
  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.registrationsService.restore(id);
  }
}
