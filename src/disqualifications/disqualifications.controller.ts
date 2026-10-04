import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { DisqualificationsService } from './disqualifications.service';

@Controller('disqualifications')
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

  @Post()
  create(
    @Body()
    body: {
      participantId: string;
      scope: 'STAGE' | 'SEASON' | 'FORMAT';
      stageId?: string;
      seasonId?: string;
      reason: string;
      issuedByUserId: string;
    },
  ) {
    return this.disqualificationsService.create(body);
  }

  @Patch(':id/revoke')
  revoke(
    @Param('id')
    id: string,

    @Body()
    body: {
      revokedByUserId: string;
      revokeReason: string;
    },
  ) {
    return this.disqualificationsService.revoke(
      id,
      body,
    );
  }
}