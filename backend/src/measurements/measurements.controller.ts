import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { CreateMeasurementDto } from './dto/create-measurement.dto';
import { AcceptMeasurementDto, RejectMeasurementDto } from './dto/review-measurement.dto';
import { MeasurementsService } from './measurements.service';

@Controller('measurements')
@Roles('ADMIN', 'JUDGE')
export class MeasurementsController {
  constructor(private readonly measurementsService: MeasurementsService) {}

  @Post()
  create(@Body() body: CreateMeasurementDto, @Req() request: AuthenticatedRequest) {
    return this.measurementsService.create(body, request);
  }

  @Get('registration/:registrationId')
  findByRegistration(@Param('registrationId') registrationId: string, @Req() request: AuthenticatedRequest) {
    return this.measurementsService.findByRegistration(registrationId, request);
  }

  @Post(':id/accept')
  accept(@Param('id') id: string, @Body() body: AcceptMeasurementDto, @Req() request: AuthenticatedRequest) {
    return this.measurementsService.accept(id, body, request);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() body: RejectMeasurementDto, @Req() request: AuthenticatedRequest) {
    return this.measurementsService.reject(id, body, request);
  }
}
