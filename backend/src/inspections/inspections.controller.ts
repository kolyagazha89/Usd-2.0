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
import { Roles } from '../auth/roles.decorator';
import { InspectionsService } from './inspections.service';
import { CreateInspectionDto, UpdateInspectionDto } from './dto/inspection.dto';

@Controller('inspections')
@Roles('ADMIN', 'JUDGE')
export class InspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Get('registration/:registrationId')
  findByRegistration(@Param('registrationId') registrationId: string) {
    return this.inspectionsService.findByRegistration(registrationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inspectionsService.findOne(id);
  }

  @Post('stage/:stageId/fail-pending')
  failPending(
    @Param('stageId') stageId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: { notes?: string },
  ) {
    return this.inspectionsService.failPending(stageId, body.notes, {
      userId: request.user.sub,
      role: request.user.role,
      ipAddress: request.ip,
    });
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateInspectionDto,
  ) {
    return this.inspectionsService.create(body, {
      userId: request.user.sub,
      role: request.user.role,
      ipAddress: request.ip,
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateInspectionDto,
  ) {
    return this.inspectionsService.update(id, body, {
      userId: request.user.sub,
      role: request.user.role,
      ipAddress: request.ip,
    });
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.inspectionsService.remove(id, {
      userId: request.user.sub,
      role: request.user.role,
      ipAddress: request.ip,
    });
  }
}
