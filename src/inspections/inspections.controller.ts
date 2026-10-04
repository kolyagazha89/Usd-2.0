import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { InspectionsService } from './inspections.service';

@Controller('inspections')
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

  @Post()
  create(
    @Body()
    body: {
      registrationId: string;
      checkedByUserId?: string;
      checkedByName?: string;
      notes?: string;
    },
  ) {
    return this.inspectionsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      status?: 'PASSED' | 'FAILED';
      checkedByUserId?: string | null;
      checkedByName?: string | null;
      notes?: string | null;
    },
  ) {
    return this.inspectionsService.update(id, body);
  }
}