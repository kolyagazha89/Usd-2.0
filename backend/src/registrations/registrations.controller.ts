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

  @Roles('ADMIN')
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

  // Personal registration works for PARTICIPANT, ADMIN and custom staff roles.
  // Passing a participant-scoped request ensures staff cannot use their broad
  // operational permissions to register or cancel on behalf of someone else.
  private asParticipant(request: AuthenticatedRequest): AuthenticatedRequest {
    return Object.assign(Object.create(request), {
      user: { ...request.user, role: 'PARTICIPANT', customRoleId: undefined },
    }) as AuthenticatedRequest;
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Post('me')
  async createMyRegistration(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateRegistrationDto,
  ) {
    if (!request.user.participantId) {
      throw new ForbiddenException('Сначала создайте профиль участника');
    }
    return this.registrationsService.create(this.asParticipant(request), {
      ...body, participantId: request.user.participantId, source: 'PRE_REGISTRATION',
    });
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Delete('me/:id')
  async cancelMyRegistration(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    if (!request.user.participantId) {
      throw new ForbiddenException('Профиль участника ещё не создан');
    }
    const registration = await this.registrationsService.findOne(id);
    if (registration.participantId !== request.user.participantId) {
      throw new ForbiddenException('Нет доступа к этой регистрации');
    }
    return this.registrationsService.cancel(id, this.asParticipant(request));
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

  @Roles('ADMIN', 'PARTICIPANT')
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
