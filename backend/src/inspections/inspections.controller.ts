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
@Roles('ADMIN')
export class InspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Get('registration/:registrationId')
  findByRegistration(@Param('registrationId') registrationId: string) {
    return this.inspectionsService.findByRegistration(registrationId);
  }

  @Get('class/:registrationClassId')
  findByRegistrationClass(@Param('registrationClassId') registrationClassId: string) {
    return this.inspectionsService.findByRegistrationClass(registrationClassId);
  }

  @Post('class')
  createClassInspection(
    @Req() request: AuthenticatedRequest,
    @Body() body: { registrationClassId: string; status: 'PASSED' | 'FAILED'; notes?: string },
  ) {
    return this.inspectionsService.createClassInspection(body, {
      userId: request.user.sub,
      role: request.user.role,
      customRoleId: request.user.customRoleId,
      ipAddress: request.ip,
    });
  }

  @Patch('class/:id')
  updateClassInspection(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateInspectionDto,
  ) {
    return this.inspectionsService.updateClassInspection(id, body, {
      userId: request.user.sub,
      role: request.user.role,
      customRoleId: request.user.customRoleId,
      ipAddress: request.ip,
    });
  }

  @Roles('ADMIN')
  @Delete('class/:id')
  removeClassInspection(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.inspectionsService.removeClassInspection(id, {
      userId: request.user.sub,
      role: request.user.role,
      customRoleId: request.user.customRoleId,
      ipAddress: request.ip,
    });
  }

  @Patch('registration/:registrationId/classes')
  updateRegistrationClasses(
    @Param('registrationId') registrationId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: { classIds: string[] },
  ) {
    return this.inspectionsService.updateRegistrationClasses(registrationId, body.classIds, {
      userId: request.user.sub,
      role: request.user.role,
      customRoleId: request.user.customRoleId,
      ipAddress: request.ip,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inspectionsService.findOne(id);
  }

  @Post('stage/:stageId/pass-pending')
  passPending(
    @Param('stageId') stageId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inspectionsService.passPending(stageId, {
      userId: request.user.sub,
      role: request.user.role,
      customRoleId: request.user.customRoleId,
      ipAddress: request.ip,
    });
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
      customRoleId: request.user.customRoleId,
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
      customRoleId: request.user.customRoleId,
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
      customRoleId: request.user.customRoleId,
      ipAddress: request.ip,
    });
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.inspectionsService.remove(id, {
      userId: request.user.sub,
      role: request.user.role,
      customRoleId: request.user.customRoleId,
      ipAddress: request.ip,
    });
  }
}
