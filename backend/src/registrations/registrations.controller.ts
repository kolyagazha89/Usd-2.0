import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { Roles } from '../auth/roles.decorator';
import { RegistrationsService } from './registrations.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';

@Controller('registrations')
export class RegistrationsController {
  constructor(
    private readonly registrationsService: RegistrationsService,
  ) {}

  @Roles('ADMIN', 'JUDGE')
  @Get()
  findAll(
    @Query('stageId') stageId?: string,
    @Query('status') status?: 'ACTIVE' | 'CANCELLED',
  ) {
    return this.registrationsService.findAll(stageId, status);
  }

  @Roles('PARTICIPANT')
  @Get('me')
  async findMyRegistrations(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: 'ACTIVE' | 'CANCELLED',
  ) {
    if (!request.user.participantId) {
      throw new ForbiddenException('Профиль участника ещё не создан');
    }

    return this.registrationsService.findByParticipant(
      request.user.participantId,
      status,
    );
  }

  @Get(':id')
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const registration =
      await this.registrationsService.findOne(id);

    if (
      request.user.role === 'PARTICIPANT' &&
      registration.participantId !== request.user.participantId
    ) {
      throw new ForbiddenException(
        'Нет доступа к этой регистрации',
      );
    }

    return registration;
  }

  @Roles('ADMIN', 'JUDGE', 'PARTICIPANT')
  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateRegistrationDto,
  ) {
    return this.registrationsService.create(
      request,
      body,
    );
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Delete(':id')
  async cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const registration =
      await this.registrationsService.findOne(id);

    if (
      request.user.role === 'PARTICIPANT' &&
      registration.participantId !== request.user.participantId
    ) {
      throw new ForbiddenException(
        'Нет доступа к этой регистрации',
      );
    }

    return this.registrationsService.cancel(id, request);
  }
}
