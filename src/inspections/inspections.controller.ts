import {
  Body,
  Req,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { Roles } from '../auth/roles.decorator';
import { InspectionsService } from './inspections.service';
import { CreateInspectionDto, UpdateInspectionDto } from './dto/inspection.dto';

@Controller('inspections')
@Roles('ADMIN', 'JUDGE')
export class InspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inspectionsService.findOne(id);
  }

  @Get('registration/:registrationId')
  findByRegistration(
    @Param('registrationId') registrationId: string,
  ) {
    return this.inspectionsService.findByRegistration(registrationId);
  }

  @Roles('ADMIN', 'JUDGE')
  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateInspectionDto,
  ) {
    return this.inspectionsService.create({ ...body, checkedByUserId: request.user.sub });
  }

  @Roles('ADMIN', 'JUDGE')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateInspectionDto,
  ) {
    return this.inspectionsService.update(id, { ...body, checkedByUserId: request.user.sub });
  }
}