import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { Public } from '../auth/public.decorator';
import { ParticipantsService } from './participants.service';
import { Roles } from '../auth/roles.decorator';

import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { CreateParticipantDto, UpdateParticipantDto } from './dto/participant.dto';

@Controller()
export class ParticipantsController {
  constructor(
    private readonly participantsService: ParticipantsService,
  ) {}

  // =========================================================
  // ADMIN PARTICIPANTS
  // =========================================================

  @Roles('ADMIN')
  @Get('admin/participants')
  findAllAdmin(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.participantsService.findAllAdmin(request);
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Get('participants/teams')
  findTeams(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.participantsService.findTeams(request);
  }

  @Roles('ADMIN')
  @Get('participants/lookup')
  findAllForOperations(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.participantsService.findAllForOperations(request);
  }

  // =========================================================
  // PUBLIC PARTICIPANTS
  // =========================================================

  @Public()
  @Get('participants')
  findAll() {
    return this.participantsService.findAll();
  }

  // =========================================================
  // CURRENT PARTICIPANT
  // =========================================================

  @Roles('PARTICIPANT')
  @Get('participants/me')
  findMe(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.participantsService.findMe(request);
  }

  @Roles('PARTICIPANT')
  @Post('participants/me')
  createMe(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateParticipantDto,
  ) {
    return this.participantsService.createMe(
      request,
      body,
    );
  }

  @Roles('PARTICIPANT')
  @Patch('participants/me')
  updateMe(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateParticipantDto,
  ) {
    return this.participantsService.updateMe(
      request,
      body,
    );
  }

  /** Personal USD ID is separate from the stage-specific registration QR. */
  @Roles('PARTICIPANT')
  @Get('participants/me/usd-id')
  myUsdId(@Req() request: AuthenticatedRequest) {
    return this.participantsService.getMyUsdId(request);
  }

  @Roles('PARTICIPANT')
  @Post('participants/me/usd-id/rotate')
  rotateMyUsdId(@Req() request: AuthenticatedRequest) {
    return this.participantsService.rotateMyUsdId(request);
  }

  // =========================================================
  // ALL CARS — ADMIN / JUDGE
  // =========================================================

  @Roles('ADMIN')
  @Get('cars')
  findAllCars(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.participantsService.findAllCars(request);
  }

  // =========================================================
  // CURRENT PARTICIPANT CARS
  // =========================================================

  @Roles('PARTICIPANT')
  @Get('participants/me/cars')
  findMyCars(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.participantsService.findMyCars(request);
  }

  @Roles('PARTICIPANT')
  @Post('participants/me/cars')
  createMyCar(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateCarDto,
  ) {
    return this.participantsService.createMyCar(
      request,
      body,
    );
  }

  // =========================================================
  // PUBLIC PARTICIPANT PROFILE
  // =========================================================

  @Public()
  @Get('participants/:id')
  findOne(
    @Param('id') id: string,
  ) {
    return this.participantsService.findOne(id);
  }

  // =========================================================
  // ADMIN PARTICIPANTS
  // =========================================================

  @Roles('ADMIN')
  @Post('participants')
  createParticipant(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateParticipantDto,
  ) {
    return this.participantsService.createParticipant(
      request,
      body,
    );
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Patch('participants/:id')
  updateParticipant(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateParticipantDto,
  ) {
    return this.participantsService.updateParticipant(
      request,
      id,
      body,
    );
  }

  @Roles('ADMIN')
  @Delete('participants/:id')
  removeParticipant(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.participantsService.removeParticipant(
      request,
      id,
    );
  }

  // =========================================================
  // PARTICIPANT CARS — ADMIN / JUDGE
  // =========================================================

  @Roles('ADMIN')
  @Get('participants/:participantId/cars')
  findCars(
    @Req() request: AuthenticatedRequest,
    @Param('participantId') participantId: string,
  ) {
    return this.participantsService.findCars(
      request,
      participantId,
    );
  }

  @Roles('ADMIN')
  @Post('participants/:participantId/cars')
  createCar(
    @Req() request: AuthenticatedRequest,
    @Param('participantId') participantId: string,
    @Body() body: CreateCarDto,
  ) {
    return this.participantsService.createCar(
      request,
      participantId,
      body,
    );
  }

  // =========================================================
  // CAR
  // =========================================================

  @Public()
  @Get('cars/:id')
  findCar(
    @Param('id') id: string,
  ) {
    return this.participantsService.findCar(id);
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Patch('cars/:id')
  updateCar(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateCarDto,
  ) {
    return this.participantsService.updateCar(
      request,
      id,
      body,
    );
  }

  @Roles('ADMIN', 'PARTICIPANT')
  @Delete('cars/:id')
  removeCar(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.participantsService.removeCar(
      request,
      id,
    );
  }
}