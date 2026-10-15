import {
  Body,
  Req,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

import { DisqualificationsService } from './disqualifications.service';
import { Roles } from '../auth/roles.decorator';
import { CreateDisqualificationDto, RevokeDisqualificationDto } from './dto/disqualification.dto';

@Controller('disqualifications')
@Roles('ADMIN')
export class DisqualificationsController {
  constructor(
    private readonly disqualificationsService: DisqualificationsService,
  ) {}

  @Get()
  findAll(
    @Query('participantId')
    participantId?: string,

    @Query('scope')
    scope?: 'STAGE' | 'SEASON' | 'FORMAT',

    @Query('status')
    status?: 'ACTIVE' | 'REVOKED',

    @Query('stageId')
    stageId?: string,

    @Query('seasonId')
    seasonId?: string,

    @Query('search')
    search?: string,
  ) {
    return this.disqualificationsService.findAll({
      participantId,
      scope,
      status,
      stageId,
      seasonId,
      search,
    });
  }

  @Get('participant/:participantId/stage/:stageId')
  getActiveForParticipantAtStage(
    @Param('participantId')
    participantId: string,

    @Param('stageId')
    stageId: string,
  ) {
    return this.disqualificationsService.getActiveForParticipantAtStage(
      participantId,
      stageId,
    );
  }

  @Get('result/:resultId')
  getResultDisqualifications(
    @Param('resultId')
    resultId: string,
  ) {
    return this.disqualificationsService.getResultDisqualifications(
      resultId,
    );
  }

  @Get(':id')
  findOne(
    @Param('id')
    id: string,
  ) {
    return this.disqualificationsService.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateDisqualificationDto,
  ) {
    return this.disqualificationsService.create({ ...body, issuedByUserId: request.user.sub });
  }

  @Roles('ADMIN')
  @Patch(':id/revoke')
  revoke(
    @Param('id')
    id: string,

    @Req() request: AuthenticatedRequest,

    @Body() body: RevokeDisqualificationDto,
  ) {
    return this.disqualificationsService.revoke(id, {
      ...body,
      revokedByUserId: request.user.sub,
    });
  }
}